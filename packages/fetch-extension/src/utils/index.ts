import { NameAddress } from "@chatTypes";
import {
  CHAIN_ID_DORADO,
  CHAIN_ID_FETCHHUB,
  CHAIN_ID_LOCAL_TEST_NETWORK,
  CHAIN_ID_REMOTE_TEST_NETWORK,
} from "../config.ui.var";
import { formatAddress } from "./format";
import { GroupEvent } from "./group-events";

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

export function isFeatureAvailable(chainId: string): boolean {
  return [
    CHAIN_ID_FETCHHUB,
    CHAIN_ID_DORADO,
    CHAIN_ID_LOCAL_TEST_NETWORK,
    CHAIN_ID_REMOTE_TEST_NETWORK,
  ].includes(chainId);
}
