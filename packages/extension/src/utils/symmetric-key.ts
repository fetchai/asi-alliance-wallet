import { toBase64, toUtf8 } from "@cosmjs/encoding";
import { EncryptMessagingMessage } from "@keplr-wallet/background/build/messaging";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import crypto from "crypto";
import { GroupAddress } from "@chatTypes";

function generateSymmetricKey() {
  return crypto.randomBytes(32).toString("hex");
}

export async function generateEncryptedSymmetricKeyForAddress(
  chainId: string,
  accessToken: string,
  symmetricKey: string,
  address: string
) {
  const requester = new InExtensionMessageRequester();
  const encryptMsg = new EncryptMessagingMessage(
    chainId,
    address,
    toBase64(toUtf8(JSON.stringify(symmetricKey))),
    accessToken
  );
  const encryptSymmetricKey = await requester.sendMessage(
    BACKGROUND_PORT,
    encryptMsg
  );
  return encryptSymmetricKey;
}

export const createEncryptedSymmetricKeyForAddresses = async (
  addresses: GroupAddress[],
  chainId: string,
  accessToken: string
) => {
  const newAddresses = [];
  const newSymmetricKey = generateSymmetricKey();
  for (let i = 0; i < addresses.length; i++) {
    const groupAddress = addresses[i];
    newAddresses[i] = groupAddress;
    newAddresses[
      i
    ].encryptedSymmetricKey = await generateEncryptedSymmetricKeyForAddress(
      chainId,
      accessToken,
      newSymmetricKey,
      groupAddress.address
    );
  }
  return newAddresses;
};

export function encryptGroupData(key: string, data: string) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(key, "hex"),
    iv
  );
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

export function decryptGroupData(key: string, data: string) {
  const [iv, encrypted] = data.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(key, "hex"),
    Buffer.from(iv, "hex")
  );
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
