import { DenomHelper, KVStore } from "@keplr-wallet/common";
import { ChainGetter } from "../../common";
import {
  ObservableQueryCardanoTokenBalanceInner,
  ObservableQueryCardanoTokenBalance,
} from "./token-balance";
import { ObservableQueryBalanceInner, BalanceRegistry } from "../balances";

/** Denom type prefix for Cardano native tokens: "cardanonative" */
export const CARDANO_NATIVE_TOKEN_TYPE = "cardanonative";

/** Factory that returns a shared ObservableQueryCardanoTokenBalance for a given address. */
export type TokenBalanceQueryFactory = (
  chainId: string,
  bech32Address: string
) => ObservableQueryCardanoTokenBalance;

/**
 * Balance registry for Cardano native tokens.
 * Handles denoms with format "cardanonative:{assetId}:{displayName}".
 * The assetId is policyId + assetName (hex).
 *
 * Uses a shared TokenBalanceQueryFactory to reuse the same ObservableQueryCardanoTokenBalance
 * instance that token discovery uses, avoiding duplicate Koios API calls and ensuring
 * balances are immediately available when discovery completes.
 */
export class ObservableQueryCardanoTokenBalanceRegistry
  implements BalanceRegistry
{
  constructor(
    protected readonly kvStore: KVStore,
    private readonly getSharedQuery?: TokenBalanceQueryFactory
  ) {}

  getBalanceInner(
    chainId: string,
    chainGetter: ChainGetter,
    bech32Address: string,
    minimalDenom: string
  ): ObservableQueryBalanceInner | undefined {
    const denomHelper = new DenomHelper(minimalDenom);
    const isCardano =
      chainGetter.getChain(chainId).features?.includes("cardano") ?? false;

    if (!(isCardano && denomHelper.type === CARDANO_NATIVE_TOKEN_TYPE)) {
      return undefined;
    }

    // contractAddress holds the assetId (policyId + assetName hex)
    const assetId = denomHelper.contractAddress;
    if (!assetId) {
      return undefined;
    }

    // Use shared query from discovery (same Koios data, no duplicate fetch)
    const tokenBalanceQuery = this.getSharedQuery
      ? this.getSharedQuery(chainId, bech32Address)
      : new ObservableQueryCardanoTokenBalance(
          this.kvStore,
          chainId,
          chainGetter,
          bech32Address
        );

    return new ObservableQueryCardanoTokenBalanceInner(
      this.kvStore,
      chainId,
      chainGetter,
      denomHelper,
      bech32Address,
      tokenBalanceQuery,
      assetId
    );
  }
}
