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

    const rawPaths = this.response.data.denom_trace.path.split("/");

    if (rawPaths.length % 2 !== 0) {
      console.log("Failed to parse paths", rawPaths);
      return [];
    }

    const rawPathChunks: string[][] = [];
    for (let i = 0; i < rawPaths.length; i += 2) {
      rawPathChunks.push(rawPaths.slice(i, i + 2));
    }

    return rawPathChunks.map((chunk) => {
      return {
        portId: chunk[0],
        channelId: chunk[1],
      };
    });
  }

  get denom(): string | undefined {
    if (!this.response) {
      return undefined;
    }

    return this.response.data.denom_trace.base_denom;
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
