import {
  resolveBlockfrostConfig,
  type ResolveBlockfrostConfig,
} from "@keplr-wallet/cardano";
import type { CardanoNetwork } from "@keplr-wallet/cardano";
import { BlockfrostCredentialsStore } from "./blockfrost-credentials-store";

/**
 * Password is held in closure until keyring lock/reset, not on CardanoService.
 */
export function createBlockfrostConfigResolver(
  store: BlockfrostCredentialsStore | undefined,
  password: string
): ResolveBlockfrostConfig | undefined {
  if (!store) {
    return undefined;
  }

  return async (network: CardanoNetwork) => {
    if (!(await store.hasPrefs(network))) {
      return resolveBlockfrostConfig(network);
    }

    try {
      const prefs = await store.getPrefs(network, password);
      return resolveBlockfrostConfig(network, prefs);
    } catch {
      return resolveBlockfrostConfig(network);
    }
  };
}
