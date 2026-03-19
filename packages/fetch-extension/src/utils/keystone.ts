import {
  TransportWebUSB,
  getKeystoneDevices,
  StatusCode,
} from "@keystonehq/hw-transport-webusb";
import { serialize, TransactionTypes } from "@ethersproject/transactions";
import { EthSignType } from "@keplr-wallet/types";
import { KeystoneEthereumSDK } from "@keystonehq/keystone-sdk";

export interface KeystoneUR {
  type: string;
  cbor: string;
}

export interface KeystoneKeys {
  [path: string]: {
    chain: string;
    name: string;
    pubKey: string;
  };
}

export function getPathFromPubKey(
  keys: KeystoneKeys,
  pubKey: string
): string | null {
  for (const path in keys) {
    if (Object.prototype.hasOwnProperty.call(keys, path)) {
      const key = keys[path];
      if (key.pubKey === pubKey) {
        return path;
      }
    }
  }
  return null;
}

export function getEthDataTypeFromSignType(
  signType: EthSignType,
  message?: Uint8Array
) {
  switch (signType) {
    case EthSignType.TRANSACTION:
      if (message) {
        const msg = JSON.parse(Buffer.from(message).toString());
        const isEIP1559 = !!msg.maxFeePerGas || !!msg.maxPriorityFeePerGas;
        if (isEIP1559) {
          msg.type = TransactionTypes.eip1559;
        }
        if (!msg.type) {
          return KeystoneEthereumSDK.DataType.transaction;
        }
        return KeystoneEthereumSDK.DataType.typedTransaction;
      }
      return KeystoneEthereumSDK.DataType.transaction;
    case EthSignType.MESSAGE:
      return KeystoneEthereumSDK.DataType.personalMessage;
    case EthSignType.EIP712:
      return KeystoneEthereumSDK.DataType.typedData;
  }
}

export function encodeEthMessage(
  message: Uint8Array,
  signType: EthSignType
): Buffer {
  switch (signType) {
    case EthSignType.TRANSACTION:
      const tx = JSON.parse(Buffer.from(message).toString());
      const isEIP1559 = !!tx.maxFeePerGas || !!tx.maxPriorityFeePerGas;
      if (isEIP1559) {
        tx.type = TransactionTypes.eip1559;
      }
      if (typeof tx.type === "string") {
        tx.type = +tx.type.replace(/^0x/, "");
      }
      return Buffer.from(serialize(tx).replace(/^0x/, ""), "hex");
    case EthSignType.MESSAGE:
    case EthSignType.EIP712:
      return Buffer.from(message);
  }
}

export const ErrModuleKeystoneSign = "keystone-sign";
export const ErrInvalidSigner = 1;
export const ErrInvalidRequestId = 2;
export const ErrInvalidPublicKey = 3;
export const ErrInvalidSignature = 4;
export const ErrKeystoneUSBCommunication = 5;

export async function createKeystoneTransport() {
  if ((await getKeystoneDevices()).length <= 0) {
    try {
      await TransportWebUSB.requestPermission();
    } catch (e) {
      throw new Error("USB_PERMISSIONS_NOT_AVAILABLE");
    }
  }

  const transport = await TransportWebUSB.connect({
    timeout: 100000,
  });
  await transport.close();
  return transport;
}

export function handleKeystoneUSBError(error: {
  message: string;
  transportErrorCode: StatusCode;
}) {
  if (error.message === "USB_PERMISSIONS_NOT_AVAILABLE") {
    return "Missing browser permissions";
  }

  if (error.transportErrorCode === StatusCode.PRS_PARSING_REJECTED) {
    return `Please reconnect the Keystone hardware wallet and reauthorize.`;
  }
  if (error.transportErrorCode === StatusCode.PRS_PARSING_DISALLOWED) {
    return "Please reconnect the Keystone on home screen and reauthorize.";
  }

  return "Communication with the Keystone device failed. Please ensure the Keystone is connected, and try again.";
}
