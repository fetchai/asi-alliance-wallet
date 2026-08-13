import {
  getBlockfrostConfigs,
  getNetworkConfig,
  isValidApiKey,
  type BlockfrostConfig,
} from "./env-adapter";
import type { CardanoNetwork } from "../utils/network";

export interface UserBlockfrostPrefs {
  projectId?: string;
  useCustomKey: boolean;
}

export function isUsableProjectIdString(
  projectId: string | undefined | null
): boolean {
  const trimmed = projectId?.trim();
  return isValidApiKey(trimmed ?? null);
}

/**
 * Effective Blockfrost config: built-in by default, custom projectId with built-in baseUrl when enabled.
 */
export function resolveBlockfrostConfig(
  network: CardanoNetwork,
  userPrefs?: UserBlockfrostPrefs
): BlockfrostConfig | null {
  const builtinByNetwork = getBlockfrostConfigs()[network];

  const trimmedProjectId = userPrefs?.projectId?.trim();
  if (userPrefs?.useCustomKey && isUsableProjectIdString(trimmedProjectId)) {
    return {
      baseUrl: builtinByNetwork.baseUrl,
      projectId: trimmedProjectId!,
    };
  }

  return getNetworkConfig(network);
}

export function getBlockfrostConfigSource(
  network: CardanoNetwork,
  userPrefs?: UserBlockfrostPrefs
): "builtin" | "custom" | "none" {
  const resolved = resolveBlockfrostConfig(network, userPrefs);
  if (!resolved) {
    return "none";
  }

  const trimmedProjectId = userPrefs?.projectId?.trim();
  if (
    userPrefs?.useCustomKey &&
    isUsableProjectIdString(trimmedProjectId) &&
    resolved.projectId === trimmedProjectId
  ) {
    return "custom";
  }

  return "builtin";
}
