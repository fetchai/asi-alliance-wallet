import {
  camelToSnake,
  ObservableQueryMap,
  ObservableQueryTendermint,
} from "../../../common";
import { ChannelResponse } from "./types";
import { setupIbcExtension, IbcExtension } from "@cosmjs/stargate";
import { QueryChannelResponse } from "cosmjs-types/ibc/core/channel/v1/query";
import { QuerySharedContext } from "../../../common";
import { ChainGetter } from "../../../chain";

export class ObservableChainQueryIBCChannel extends ObservableQueryTendermint<ChannelResponse> {
  protected disposer?: () => void;

  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly portId: string,
    protected readonly channelId: string
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      sharedContext,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as IbcExtension;
        const result = await client.ibc.channel.channel(portId, channelId);
        const decodedResponse = QueryChannelResponse.toJSON(result);
        return camelToSnake(decodedResponse) as ChannelResponse;
      },
      setupIbcExtension,
      `/ibc/core/channel/v1/channels/${channelId}/ports/${portId}`
    );
  }

  protected override onStop() {
    if (this.disposer) {
      this.disposer();
      this.disposer = undefined;
    }
    super.onStop();
  }
}

export class ObservableQueryIBCChannel extends ObservableQueryMap<ChannelResponse> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super((key: string) => {
      const params = JSON.parse(key);

      return new ObservableChainQueryIBCChannel(
        sharedContext,
        chainId,
        chainGetter,
        params.portId,
        params.channelId
      );
    });
  }

  getTransferChannel(channelId: string) {
    return this.getChannel("transfer", channelId);
  }

  getChannel(portId: string, channelId: string) {
    // Use key as the JSON encoded Object.
    const key = JSON.stringify({ portId, channelId });
    return this.get(key);
  }
}
