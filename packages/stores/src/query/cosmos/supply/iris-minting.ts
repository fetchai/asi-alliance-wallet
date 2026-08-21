import { ObservableChainQuery } from "../../chain-query";
import { QuerySharedContext } from "../../../common";
import { ChainGetter } from "../../../chain";

export class ObservableQueryIrisMintingInfation extends ObservableChainQuery<{
  height: string;
  result: {
    mint_denom: string;
    // Dec
    inflation: string;
  };
}> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super(kvStore, chainId, chainGetter, "/mint/params");
  }
}
