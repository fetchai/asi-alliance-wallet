import {
  getBlockfrostConfigs,
  type CardanoNetwork,
} from "@keplr-wallet/cardano";

export type BlockfrostCredentialsValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_key" | "network_mismatch" | "unreachable";
      requiresConfirmation: boolean;
    };

const NETWORK_MAGIC_BY_NETWORK: Record<CardanoNetwork, number> = {
  mainnet: 764_824_073,
  preview: 2,
  preprod: 1,
  sanchonet: 4,
};

export function assertCardanoNetworkMatchesChainId(
  chainId: string,
  network: CardanoNetwork,
  getNetworkFromChainId: (chainId: string) => CardanoNetwork
): void {
  const networkFromChainId = getNetworkFromChainId(chainId);
  if (networkFromChainId !== network) {
    throw new Error("cardano_network_mismatch");
  }
}

export async function validateBlockfrostProjectId(
  projectId: string,
  network: CardanoNetwork
): Promise<BlockfrostCredentialsValidationResult> {
  const baseUrl = getBlockfrostConfigs()[network]?.baseUrl;
  if (!baseUrl) {
    return {
      ok: false,
      reason: "unreachable",
      requiresConfirmation: true,
    };
  }

  try {
    const response = await fetch(`${baseUrl}/network`, {
      headers: {
        project_id: projectId,
      },
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        reason: "invalid_key",
        requiresConfirmation: false,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: "unreachable",
        requiresConfirmation: true,
      };
    }

    const body = (await response.json()) as { network_magic?: number };
    const expectedMagic = NETWORK_MAGIC_BY_NETWORK[network];
    if (
      typeof body.network_magic === "number" &&
      body.network_magic !== expectedMagic
    ) {
      return {
        ok: false,
        reason: "network_mismatch",
        requiresConfirmation: true,
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: "unreachable",
      requiresConfirmation: true,
    };
  }
}
