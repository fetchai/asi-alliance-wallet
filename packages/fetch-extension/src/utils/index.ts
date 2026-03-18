import { NameAddress } from "@chatTypes";
import {
  CHAIN_ID_DORADO,
  CHAIN_ID_FETCHHUB,
  CHAIN_ID_GEMINI,
  CHAIN_ID_LOCAL_TEST_NETWORK,
  CHAIN_ID_REMOTE_TEST_NETWORK,
  EXPLORER_URL,
  GEMINI_EXPLORER_URL,
} from "../config.ui.var";
import { formatAddress } from "./format";
import { GroupEvent } from "./group-events";
import { KeyInfo } from "@keplr-wallet/background";
import { RegisterMode } from "@keplr-wallet/hooks";
import { InteractionWaitingData } from "@keplr-wallet/background";
import { isRunningInSidePanel } from "./side-panel";

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
  multiKeyStoreInfo: KeyInfo[],
  registerConfigMode?: RegisterMode
) => {
  const alreadyImportedWalletNames = [
    ...new Set(
      multiKeyStoreInfo?.flatMap((item) => {
        const defaultName = item?.["name"];
        const chainNames = item?.insensitive?.["nameByChain"]
          ? Object.values(
              JSON.parse(item?.insensitive?.["nameByChain"] as string)
            )
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
  items: KeyInfo[],
  prefix = "account"
) => {
  if (items.length === 0) {
    return `${prefix}-1`;
  }

  const lastName = items[items.length - 1]?.["name"] || "";
  const match = lastName.match(new RegExp(`^${prefix}-(\\d+)$`));
  const lastNum = match ? Number(match[1]) : 0;

  return `${prefix}-${lastNum + 1}`;
};

export const validateAccountName = (
  value: string,
  multiKeyStoreInfo: KeyInfo[],
  mode: RegisterMode
): string | undefined => {
  const trimmedValue = value.trimStart();
  const isEmpty = trimmedValue === "";
  const { isValid, isValidFormat, containsLetterOrNumber } = validateWalletName(
    trimmedValue,
    multiKeyStoreInfo,
    mode
  );

  if (!isValid || isEmpty) {
    if (!isValidFormat) {
      return "Only letters, numbers and basic symbols (_-.@#()) are allowed.";
    }

    if (isEmpty) {
      return "Account name cannot be empty";
    }

    if (!containsLetterOrNumber) {
      return "Account name must contain at least one letter or number.";
    }

    return "Account name already exists, please try different name";
  }
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

export const checkWebSocket = (
  url: string,
  timeout = 5000
): Promise<boolean> => {
  return new Promise((resolve) => {
    let socket: WebSocket;
    let settled = false;

    try {
      socket = new WebSocket(url);
    } catch (e) {
      return resolve(false);
    }

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.close();
        resolve(false);
      }
    }, timeout);

    socket.onopen = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(true);
    };

    socket.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(false);
    };
  });
};

export function toWssUrl(input: string): string {
  if (!input) return "";

  const stripped = input
    .trim()
    .replace(/^(https?:\/\/|wss?:\/\/)/i, "")
    .replace(/\/+$/, "");

  return `wss://${stripped}/websocket`;
}

export const explorerBaseURL = (chainId: string) => {
  if (chainId === CHAIN_ID_GEMINI) {
    return GEMINI_EXPLORER_URL;
  } else if (chainId === CHAIN_ID_DORADO || chainId === CHAIN_ID_FETCHHUB) {
    return `${EXPLORER_URL}/${chainId}`;
  }
};

export const setInteractionDataHref = (
  interactionData: InteractionWaitingData
) => {
  if (interactionData.uri === "/unlock") {
    // /unlock의 경우는 따로 route에서 unlock이 필요한 경우
    // 강제로 unlock page를 보여주도록 처리한다.
    return;
  }

  const wasInteraction = window.location.href.includes("interaction=true");

  const queryString = `interaction=true&interactionInternal=${interactionData.isInternal}`;

  let uri = interactionData.uri;

  if (uri.startsWith("/")) {
    uri = uri.slice(1);
  }

  let url = browser.runtime.getURL(
    `/${isRunningInSidePanel() ? "sidePanel" : "popup"}.html#/` + uri
  );

  if (url.includes("?")) {
    url += "&" + queryString;
  } else {
    url += "?" + queryString;
  }

  if (wasInteraction) {
    window.location.replace(url);
  } else {
    window.location.href = url;
  }
};
