import { flowResult } from "mobx";
import { NameAddress } from "@chatTypes";
import {
  CHAIN_ID_DORADO,
  CHAIN_ID_FETCHHUB,
  CHAIN_ID_GEMINI,
  CHAIN_ID_LOCAL_TEST_NETWORK,
  CHAIN_ID_REMOTE_TEST_NETWORK,
} from "../config.ui.var";
import { formatAddress } from "./format";
import { GroupEvent } from "./group-events";
import {
  getDefaultFallbackChainId,
  MultiKeyStoreInfoWithSelected,
  walletShouldLeaveCardanoChain,
  walletSupportsCardano,
} from "@keplr-wallet/background";
import type { ChainInfo } from "@keplr-wallet/types";
import { RegisterMode } from "@keplr-wallet/hooks";

// translate the contact address into the address book name if it exists
export function getUserName(
  walletAddress: string,
  addressBook: NameAddress,
  address: string
): string {
  if (walletAddress === address) {
    return "You";
  }

  const contactAddressBookName = addressBook[address];
  return contactAddressBookName
    ? formatAddress(contactAddressBookName)
    : formatAddress(address);
}

export function getEventMessage(
  walletAddress: string,
  addressBook: NameAddress,
  message: string
): string {
  let data: GroupEvent = { action: "NA", message: "Event cant be translated" };
  try {
    data = JSON.parse(message);
  } catch (e) {
    console.log("Older group evnet cant be translated");
  }

  let eventMessage = data.message;
  if (data.createdBy) {
    eventMessage = eventMessage.replace(
      "[createdBy]",
      getUserName(walletAddress, addressBook, data.createdBy)
    );
  }
  if (data.performedOn) {
    let address = data.performedOn;
    if (address.includes(",")) {
      const addresses = address.split(",");
      const updatedAddresses = addresses.map((address) =>
        getUserName(walletAddress, addressBook, address)
      );
      address = updatedAddresses.join(",");
    } else address = getUserName(walletAddress, addressBook, address);
    eventMessage = eventMessage.replace("[performedOn]", address);
  }

  return eventMessage;
}

export const validateWalletName = (
  value: string,
  multiKeyStoreInfo: MultiKeyStoreInfoWithSelected,
  registerConfigMode?: RegisterMode
) => {
  const alreadyImportedWalletNames = [
    ...new Set(
      multiKeyStoreInfo?.flatMap((item) => {
        const defaultName = item?.meta?.["name"];
        const chainNames = item?.meta?.["nameByChain"]
          ? Object.values(JSON.parse(item?.meta?.["nameByChain"]))
          : [];
        return [defaultName, ...chainNames].filter(Boolean);
      }) ?? []
    ),
  ];

  let nameAlreadyExists = false;

  // if create mode then wallet list is empty
  if (!registerConfigMode || registerConfigMode !== "create") {
    nameAlreadyExists = alreadyImportedWalletNames.includes(value);
  }

  // Allow only alphanumeric and basic symbols
  const allowedPattern = /^[a-zA-Z0-9 @_\-\.\(\)]*$/;
  const isValidFormat = allowedPattern.test(value);

  const containsLetterOrNumber = /[a-zA-Z0-9]/.test(value);

  return {
    isValidFormat,
    nameAlreadyExists,
    containsLetterOrNumber,
    isValid: isValidFormat && !nameAlreadyExists && containsLetterOrNumber,
  };
};

export const getNextDefaultAccountName = (
  items: MultiKeyStoreInfoWithSelected,
  prefix = "account"
) => {
  if (items.length === 0) {
    return `${prefix}-1`;
  }

  const lastName = items[items.length - 1]?.meta?.["name"] || "";
  const match = lastName.match(new RegExp(`^${prefix}-(\\d+)$`));
  const lastNum = match ? Number(match[1]) : 0;

  return `${prefix}-${lastNum + 1}`;
};

export function isFeatureAvailable(chainId: string): boolean {
  return [
    CHAIN_ID_FETCHHUB,
    CHAIN_ID_DORADO,
    CHAIN_ID_LOCAL_TEST_NETWORK,
    CHAIN_ID_REMOTE_TEST_NETWORK,
    CHAIN_ID_GEMINI,
  ].includes(chainId);
}

/** True when the chain has the Cardano feature (cardano-preview, cardano-preprod, cardano-mainnet, etc.). Must match background: chain.features?.includes("cardano"). */
export function isCardanoChain(
  chain: { features?: string[] } | null | undefined
): boolean {
  return chain?.features?.includes("cardano") ?? false;
}

/** Pre-keystore UI: word count that will yield Cardano-capable mnemonic after import (matches persisted `mnemonicLength` / `walletSupportsCardano`). */
export function supportsCardanoFromMnemonicWordCount(wordCount: number): boolean {
  return wordCount === 24;
}

/** Minimal chain store surface for awaitable switch away from Cardano after add/import / account switch. */
export type ChainStoreForCardanoAwaitableSwitch = {
  readonly current: { features?: string[] };
  readonly chainInfos: Array<Pick<ChainInfo, "chainId" | "features">>;
  selectChainAndPersist(chainId: string): IterableIterator<unknown>;
};

/**
 * If the user is on Cardano but the wallet about to be selected (pre changeKeyRing) does not support
 * Cardano, switch using the same fallback policy as background (`getDefaultFallbackChainId`).
 * Prefer that helper for all add/import/switch/delete flows — avoid hard-coding a default chain id in UI.
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
 * Uses `getDefaultFallbackChainId` only — keep policy consistent with background alignment.
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

export { walletShouldLeaveCardanoChain, walletSupportsCardano };

export {
  requestKeyringSurfacesSyncBroadcast,
  syncKeyringSurfacesFromBackground,
  KEYRING_SURFACES_SYNC_MESSAGE_TYPE,
} from "./keyring-surfaces-sync";
