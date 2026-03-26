import {
  ObservableQueryTendermint,
  ObservableQueryMap,
  camelToSnake,
  decodeAccount,
} from "../../../common";
import { ChainGetter } from "../../../chain";
import { AuthAccount } from "./types";
import { computed, makeObservable } from "mobx";
import { BaseAccount } from "@keplr-wallet/cosmos";
import { AuthExtension, setupAuthExtension } from "@cosmjs/stargate";
import { QuerySharedContext } from "../../../common";

interface PubKey {
  "@type": string;
  key: string;
}

interface Base_Account {
  account_number: string;
  address: string;
  pub_key: PubKey;
  sequence: string;
}

interface Delegated {
  amount: string;
  denom: string;
}

interface BaseVestingAccount {
  base_account: Base_Account;
  delegated_free: Delegated[];
  delegated_vesting: Delegated[];
  end_time: string;
  original_vesting: Delegated[];
}
interface VestingAccount {
  "@type"?: string;
  base_vesting_account?: BaseVestingAccount;
  start_time?: string;
}

export enum VestingType {
  Continuous = "/cosmos.vesting.v1beta1.ContinuousVestingAccount",
  Delayed = "/cosmos.vesting.v1beta1.DelayedVestingAccount",
}

export class ObservableQueryAccountInner extends ObservableQueryTendermint<AuthAccount> {
  protected readonly chainGetter: ChainGetter;
  protected readonly chainId: string;
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly bech32Address: string
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      sharedContext,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as AuthExtension;
        const result = await client.auth.account(bech32Address);
        const decodedResponse = result ? decodeAccount(result) : {};
        return {
          account: camelToSnake(decodedResponse),
        };
      },
      setupAuthExtension,
      `/cosmos/auth/v1beta1/accounts/${bech32Address}`
    );
    this.chainId = chainId;
    this.bech32Address = bech32Address;
    this.chainGetter = chainGetter;
    makeObservable(this);
  }

  protected override canFetch(): boolean {
    /* If bech32 address is empty, it will always fail, so don't need to fetch it.
    also avoid fetching the endpoint for evm networks*/
    const chainInfo = this.chainGetter.getChain(this.chainId);
    return (
      this.bech32Address.length > 0 &&
      !chainInfo?.features?.includes("eth-key-sign")
    );
  }

  @computed
  get sequence(): string {
    if (!this.response) {
      return "0";
    }

    // XXX: In launchpad, the status was 200 even if the account not exist.
    //      However, from stargate, the status becomes 404 if the account not exist.
    //      This case has not been dealt with yet.
    //      However, in the case of 404, it will be treated as an error, and in this case the sequence should be 0.

    try {
      const account = BaseAccount.fromProtoJSON(
        this.response.data,
        this.bech32Address
      );
      return account.getSequence().toString();
    } catch {
      return "0";
    }
  }

  @computed
  get isVestingAccount(): boolean {
    if (!this.response) {
      return false;
    }

    return !!this.response.data?.account.base_vesting_account;
  }

  @computed
  get vestingAccount(): VestingAccount {
    if (!this.response) {
      return {};
    }

    return this.response.data?.account;
  }
}

export class ObservableQueryAccount extends ObservableQueryMap<AuthAccount> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super((bech32Address) => {
      return new ObservableQueryAccountInner(
        sharedContext,
        chainId,
        chainGetter,
        bech32Address
      );
    });
  }

  getQueryBech32Address(bech32Address: string): ObservableQueryAccountInner {
    return this.get(bech32Address) as ObservableQueryAccountInner;
  }
}
