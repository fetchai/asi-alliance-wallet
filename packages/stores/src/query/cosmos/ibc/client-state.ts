import { KVStore } from "@keplr-wallet/common";
import {
  camelToSnake,
  ChainGetter,
  decodeIBCClientState,
  ObservableQueryMap,
  ObservableQueryTendermint,
} from "../../../common";
import { ClientStateResponse } from "./types";
import { computed } from "mobx";
import { IbcExtension, setupIbcExtension } from "@cosmjs/stargate";
import { QueryChannelClientStateResponse } from "cosmjs-types/ibc/core/channel/v1/query";

export class ObservableChainQueryClientState extends ObservableQueryTendermint<ClientStateResponse> {
  protected disposer?: () => void;

  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly portId: string,
    protected readonly channelId: string
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as IbcExtension;
        const result = await client.ibc.channel.clientState(portId, channelId);
        const decodedResponse = QueryChannelClientStateResponse.toJSON(result);
        const ibcClentStateResponse = {
          ...decodedResponse,
          identifiedClientState: {
            ...decodedResponse.identifiedClientState,
            clientState: decodeIBCClientState(
              decodedResponse.identifiedClientState?.clientState
            ),
          },
        };
        return camelToSnake(ibcClentStateResponse) as ClientStateResponse;
      },
      setupIbcExtension,
      `/ibc/core/channel/v1beta1/channels/${channelId}/ports/${portId}/client_state`
    );
  }

  /**
   * clientChainId returns the chain id of the client state if the client state's type is known (currently, only tendermint is supported).
   */
  @computed
  get clientChainId(): string | undefined {
    if (!this.response) {
      return undefined;
    }

    return this.response.data.identified_client_state?.client_state?.[
      "chain_id"
    ] as string | undefined;
  }
}

export class ObservableQueryIBCClientState extends ObservableQueryMap<ClientStateResponse> {
  constructor(
    protected readonly kvStore: KVStore,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((key: string) => {
      const params = JSON.parse(key);

      return new ObservableChainQueryClientState(
        this.kvStore,
        this.chainId,
        this.chainGetter,
        params.portId,
        params.channelId
      );
    });
  }

  getClientStateOnTransferPort(
    channelId: string
  ): ObservableChainQueryClientState {
    return this.getClientState("transfer", channelId);
  }

  getClientState(
    portId: string,
    channelId: string
  ): ObservableChainQueryClientState {
    // Use key as the JSON encoded Object.
    const key = JSON.stringify({
      portId,
      channelId,
    });

    return this.get(key) as ObservableChainQueryClientState;
  }
}
