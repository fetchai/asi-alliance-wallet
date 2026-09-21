import {
  getDefaultFallbackChainId,
  walletShouldLeaveCardanoChain,
  walletSupportsCardano,
} from "@keplr-wallet/background/cardano-chain-policy";
import { flowResult } from "mobx";
import type { ChainInfo } from "@keplr-wallet/types";
import { isCardanoChain } from "./is-cardano-chain";

/** Minimal chain store surface for awaitable switch away from Cardano after add/import / account switch. */
export type ChainStoreForCardanoAwaitableSwitch = {
  readonly current: { features?: string[] };
  readonly chainInfos: Array<Pick<ChainInfo, "chainId" | "features">>;
  selectChainAndPersist(chainId: string): IterableIterator<unknown>;
};

/**
 * If the user is on Cardano but the wallet about to be selected (pre changeKeyRing) does not support
 * Cardano, switch using the same fallback policy as background (`getDefaultFallbackChainId`).
 */
export async function ensureCompatibleChainForUpcomingWallet(
  chainStore: ChainStoreForCardanoAwaitableSwitch,
  options: { supportsCardano: boolean }
): Promise<void> {
  if (!isCardanoChain(chainStore.current)) {
    return;
  }
  if (options.supportsCardano) {
    return;
  }
  const fallback = getDefaultFallbackChainId(chainStore.chainInfos);
  if (!fallback) {
    return;
  }
  await flowResult(chainStore.selectChainAndPersist(fallback));
}

/**
 * Enforce background-aligned fallback before selecting a different keystore (manual switch, etc.).
 */
export async function ensureChainCompatibleBeforeSelectKeyStore(
  chainStore: ChainStoreForCardanoAwaitableSwitch,
  targetKeyStore: Parameters<typeof walletSupportsCardano>[0]
): Promise<void> {
  if (!isCardanoChain(chainStore.current)) {
    return;
  }
  if (!walletShouldLeaveCardanoChain(targetKeyStore)) {
    return;
  }
  const fallback = getDefaultFallbackChainId(chainStore.chainInfos);
  if (!fallback) {
    return;
  }
  await flowResult(chainStore.selectChainAndPersist(fallback));
}
