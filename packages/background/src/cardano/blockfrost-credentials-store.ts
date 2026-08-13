import { KVStore } from "@keplr-wallet/common";
import { isUsableProjectIdString } from "@keplr-wallet/cardano";
import type { CardanoNetwork } from "@keplr-wallet/cardano";
import { CommonCrypto } from "../keyring/types";
import { Crypto } from "../keyring/crypto";
import { Buffer } from "buffer/";

export const BLOCKFROST_CREDENTIALS_STORE_VERSION = 1;

export interface BlockfrostCredentialsPayload {
  projectId: string;
  useCustomKey: boolean;
}

type EncryptedBlockfrostCredentialsBlob = Awaited<
  ReturnType<typeof Crypto.encryptBlob>
>;

export function maskBlockfrostProjectId(projectId: string): string {
  const trimmed = projectId.trim();
  if (trimmed.length <= 8) {
    return "****";
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export class BlockfrostCredentialsStore {
  constructor(
    private readonly kvStore: KVStore,
    private readonly crypto: CommonCrypto
  ) {}

  async hasPrefs(network: CardanoNetwork): Promise<boolean> {
    const raw = await this.kvStore.get(this.getKey(network));
    return raw != null;
  }

  async getPrefs(
    network: CardanoNetwork,
    password: string
  ): Promise<BlockfrostCredentialsPayload | undefined> {
    const raw = await this.kvStore.get<string>(this.getKey(network));
    if (raw == null) {
      return undefined;
    }

    const payload = await this.decryptPayload(raw, password);
    if (!isUsableProjectIdString(payload.projectId)) {
      return undefined;
    }

    return {
      projectId: payload.projectId.trim(),
      useCustomKey: payload.useCustomKey,
    };
  }

  async savePrefs(
    network: CardanoNetwork,
    password: string,
    prefs: BlockfrostCredentialsPayload
  ): Promise<void> {
    if (!isUsableProjectIdString(prefs.projectId)) {
      throw new Error("blockfrost_invalid_project_id");
    }

    const normalized: BlockfrostCredentialsPayload = {
      projectId: prefs.projectId.trim(),
      useCustomKey: prefs.useCustomKey,
    };

    const encrypted = await Crypto.encryptBlob(
      this.crypto,
      "scrypt",
      JSON.stringify(normalized),
      password,
      { blockfrostCredentials: network }
    );

    await this.kvStore.set(this.getKey(network), JSON.stringify(encrypted));
  }

  async clearPrefs(network: CardanoNetwork): Promise<void> {
    await this.kvStore.set(this.getKey(network), null);
  }

  private async decryptPayload(
    raw: string,
    password: string
  ): Promise<BlockfrostCredentialsPayload> {
    const encrypted = JSON.parse(raw) as EncryptedBlockfrostCredentialsBlob;
    const decrypted = await Crypto.decryptBlob(
      this.crypto,
      encrypted,
      password
    );
    const parsed = JSON.parse(
      Buffer.from(decrypted).toString()
    ) as BlockfrostCredentialsPayload;

    if (
      typeof parsed?.projectId !== "string" ||
      typeof parsed?.useCustomKey !== "boolean"
    ) {
      throw new Error("blockfrost_credentials_corrupt");
    }

    return parsed;
  }

  private getKey(network: CardanoNetwork): string {
    return `blockfrost-credentials.v${BLOCKFROST_CREDENTIALS_STORE_VERSION}:${network}`;
  }
}
