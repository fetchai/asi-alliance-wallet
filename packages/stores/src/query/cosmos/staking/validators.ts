import { BondStatus, Validator } from "./types";
import { KVStore } from "@keplr-wallet/common";
import {
  base64ToBytes,
  ChainGetter,
  ObservableQueryMap,
  ObservableQueryTendermint,
} from "../../../common";
import { computed, makeObservable, observable, runInAction } from "mobx";
import { ObservableQuery, QueryResponse, camelToSnake } from "../../../common";
import Axios from "axios";
import PQueue from "p-queue";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import { computedFn } from "mobx-utils";
import { setupStakingExtension, StakingExtension } from "@cosmjs/stargate";
import { QueryValidatorsResponse } from "cosmjs-types/cosmos/staking/v1beta1/query";
/* eslint-disable-next-line import/no-extraneous-dependencies */
import { decodePubkey } from "@cosmjs/proto-signing";

interface KeybaseResult {
  status: {
    code: number;
    name: string;
  };
  them?: [
    {
      id?: string;
      pictures?: {
        primary?: {
          url?: string;
        };
      };
    }
  ];
}

/**
 * Fetch the validator's thumbnail from keybase if the identity exists.
 */
export class ObservableQueryValidatorThumbnail extends ObservableQuery<KeybaseResult> {
  /**
   * Throttle down fetching the thumbnail from Keybase.
   * If too many requests occurs at the same time, Keybase will reject these requests.
   * @protected
   */
  protected static fetchingThumbnailQueue: PQueue = new PQueue({
    concurrency: 3,
  });

  protected readonly validator: Validator;

  constructor(kvStore: KVStore, validator: Validator) {
    const instance = Axios.create({
      baseURL: "https://keybase.io/",
    });

    super(
      kvStore,
      instance,
      `_/api/1.0/user/lookup.json?fields=pictures&key_suffix=${validator.description.identity}`
    );
    makeObservable(this);

    this.validator = validator;
  }

  protected override canFetch(): boolean {
    return this.validator.description.identity !== "";
  }

  protected override async fetchResponse(
    abortController: AbortController
  ): Promise<{ response: QueryResponse<KeybaseResult>; headers: any }> {
    return await ObservableQueryValidatorThumbnail.fetchingThumbnailQueue.add(
      () => {
        return super.fetchResponse(abortController);
      }
    );
  }

  @computed
  get thumbnail(): string {
    if (this.response?.data.status.code === 0) {
      if (this.response.data.them && this.response.data.them.length > 0) {
        return this.response.data.them[0].pictures?.primary?.url ?? "";
      }
    }

    return "";
  }
}

export class ObservableQueryValidatorsInner extends ObservableQueryTendermint<QueryValidatorsResponse> {
  protected readonly chainId: string;
  protected readonly chainGetter: ChainGetter;
  @observable.shallow
  protected thumbnailMap: Map<string, ObservableQueryValidatorThumbnail> =
    new Map();

  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly status: BondStatus
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as StakingExtension;
        const bondStatus = (() => {
          switch (status) {
            case BondStatus.Bonded:
              return "BOND_STATUS_BONDED";
            case BondStatus.Unbonded:
              return "BOND_STATUS_UNBONDED";
            case BondStatus.Unbonding:
              return "BOND_STATUS_UNBONDING";
            default:
              return "";
          }
        })();

        const response = await client.staking.validators(bondStatus);
        return response;
      },
      setupStakingExtension,
      `/cosmos/staking/v1beta1/validators?status=${status}&pagination.limit=1000`
    );
    makeObservable(this);
    this.chainId = chainId;
    this.chainGetter = chainGetter;
  }

  @computed
  get validators(): Validator[] {
    if (!this.response) {
      return [];
    }

    const decimals = this.chainGetter.getChain(this.chainId).currencies[0]
      .coinDecimals;
    const decodedResponse = QueryValidatorsResponse.toJSON(this.response.data);
    const parsedValidators = decodedResponse.validators.map((item) => ({
      ...item,
      unbondingHeight: item.unbondingHeight.toString(),
      delegatorShares: new Dec(item.delegatorShares, decimals).toString(),
      consensusPubkey: {
        "@type": item.consensusPubkey?.typeUrl,
        key: item?.consensusPubkey
          ? decodePubkey({
              ...item.consensusPubkey,
              value: base64ToBytes(item.consensusPubkey.value),
            })?.value
          : "",
      },
      commission: {
        ...item.commission,
        commissionRates: {
          maxRate: new Dec(
            item.commission.commissionRates.maxRate,
            18
          ).toString(),
          rate: new Dec(item.commission.commissionRates.rate, 18).toString(),
          maxChangeRate: new Dec(
            item.commission.commissionRates.maxChangeRate,
            18
          ).toString(),
        },
      },
    }));
    return camelToSnake(parsedValidators) as Validator[];
  }

  readonly getValidator = computedFn(
    (validatorAddress: string): Validator | undefined => {
      const validators = this.validators;
      return camelToSnake(
        validators.find((val) => val.operator_address === validatorAddress)
      );
    }
  );

  @computed
  get validatorsSortedByVotingPower(): Validator[] {
    const validators = this.validators;
    return validators.sort((v1, v2) => {
      return new Dec(v1.tokens).gt(new Dec(v2.tokens)) ? -1 : 1;
    });
  }

  readonly getValidatorThumbnail = computedFn(
    (operatorAddress: string): string => {
      const validators = this.validators;
      const validator = validators.find(
        (val) => val.operator_address === operatorAddress
      );
      if (!validator) {
        return "";
      }

      if (!validator.description.identity) {
        return "";
      }

      const identity = validator.description.identity;

      if (!this.thumbnailMap.has(identity)) {
        runInAction(() => {
          this.thumbnailMap.set(
            identity,
            new ObservableQueryValidatorThumbnail(this.kvStore, validator)
          );
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.thumbnailMap.get(identity)!.thumbnail;
    }
  );

  /**
   * Return the validator's voting power as human friendly (considering the coin decimals).
   */
  readonly getValidatorShare = computedFn(
    (operatorAddress: string): CoinPretty | undefined => {
      const validators = this.validators;
      const validator = validators.find(
        (val) => val.operator_address === operatorAddress
      );
      if (!validator) {
        return;
      }

      const chainInfo = this.chainGetter.getChain(this.chainId);
      const stakeCurrency = chainInfo.stakeCurrency;

      const power = new Dec(validator.tokens).truncate();

      return new CoinPretty(stakeCurrency, power);
    }
  );
}

export class ObservableQueryValidators extends ObservableQueryMap<QueryValidatorsResponse> {
  constructor(
    protected readonly kvStore: KVStore,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((status: string) => {
      return new ObservableQueryValidatorsInner(
        this.kvStore,
        this.chainId,
        this.chainGetter,
        status as BondStatus
      );
    });
  }

  getQueryStatus(
    status: BondStatus = BondStatus.Bonded
  ): ObservableQueryValidatorsInner {
    return this.get(status) as ObservableQueryValidatorsInner;
  }
}
