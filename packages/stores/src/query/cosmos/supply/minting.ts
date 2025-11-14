import { MintingInflation } from "./types";
import { KVStore } from "@keplr-wallet/common";
import { ChainGetter, ObservableQueryTendermint } from "../../../common";
import { MintExtension, setupMintExtension } from "@cosmjs/stargate";

export class ObservableQueryMintingInfation extends ObservableQueryTendermint<MintingInflation> {
  constructor(kvStore: KVStore, chainId: string, chainGetter: ChainGetter) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as MintExtension;
        const result = await client.mint.inflation();
        return { inflation: result.toString() };
      },
      setupMintExtension,
      "/cosmos/mint/v1beta1/inflation"
    );
  }
}
