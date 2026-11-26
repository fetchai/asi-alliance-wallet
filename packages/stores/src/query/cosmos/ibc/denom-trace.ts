import { ObservableQueryMap, ObservableQueryTendermint } from "../../../common";
import { ChainGetter } from "../../../chain";
import { DenomTraceResponse } from "./types";
import { computed } from "mobx";
import { camelToSnake } from "../../../common";
import { IbcExtension, setupIbcExtension } from "@cosmjs/stargate";
import { QuerySharedContext } from "../../../common";

export class ObservableChainQueryDenomTrace extends ObservableQueryTendermint<DenomTraceResponse> {
  protected disposer?: () => void;

  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly hash: string
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      sharedContext,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as IbcExtension;
        const response = await client.ibc.transfer.denomTrace(this.hash);
        return camelToSnake(response) as DenomTraceResponse;
      },
      setupIbcExtension,
      `/ibc/apps/transfer/v1/denom_traces/${hash}`
    );
  }

  @computed
  get paths(): {
    portId: string;
    channelId: string;
  }[] {
    if (!this.response) {
      return [];
    }

    return this.response.data.denom.trace.map((hop) => {
      return {
        portId: hop.port_id,
        channelId: hop.channel_id,
      };
    });
  }

  get denom(): string | undefined {
    if (!this.response) {
      return undefined;
    }

    return this.response.data.denom.base;
  }

  @computed
  get denomTrace():
    | {
        denom: string;
        paths: {
          portId: string;
          channelId: string;
        }[];
      }
    | undefined {
    if (!this.response || !this.denom) {
      return undefined;
    }

    return {
      denom: this.denom,
      paths: this.paths,
    };
  }
}

export class ObservableQueryDenomTrace extends ObservableQueryMap<DenomTraceResponse> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super((hash: string) => {
      return new ObservableChainQueryDenomTrace(
        sharedContext,
        chainId,
        chainGetter,
        hash
      );
    });
  }

  getDenomTrace(hash: string): ObservableChainQueryDenomTrace {
    return this.get(hash) as ObservableChainQueryDenomTrace;
  }
}
