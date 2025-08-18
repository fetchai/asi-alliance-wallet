import { Cardano, HandleProvider, HandleResolution, Asset } from '@cardano-sdk/core';

const MAX_ADDRESS_BOOK_NAME_LENGTH = 20;

const hasWhiteSpace = (s: string) => s.trim() !== s;

const isHandle = (address: string): boolean => address.startsWith('$');

export const verifyHandle = async (
  value: string,
  handleResolver: HandleProvider
): Promise<{ valid: boolean; handles?: (HandleResolution | null)[]; message?: string }> => {
  try {
    const resolvedHandles = await handleResolver.resolveHandles({ handles: [value.slice(1).toLowerCase()] });
    if (!resolvedHandles[0]) {
      return { valid: false };
    }
    return { valid: true, handles: resolvedHandles };
  } catch (error) {
    return {
      valid: false,
      message: `Error occurred during handle verification: ${error}`
    };
  }
};

type CustomErrorProps = {
  message: string;
  expectedAddress: Cardano.PaymentAddress;
  actualAddress: Cardano.PaymentAddress;
};

export class CustomConflictError extends Error {
  expectedAddress: Cardano.PaymentAddress;
  actualAddress: Cardano.PaymentAddress;

  constructor({ message, expectedAddress, actualAddress }: CustomErrorProps) {
    super(message);
    this.expectedAddress = expectedAddress;
    this.actualAddress = actualAddress;
    Object.setPrototypeOf(this, CustomConflictError.prototype);
  }
}

export class CustomError extends Error {
  constructor(message: string, public readonly isValidHandle: boolean = true) {
    super(message);
    this.name = 'CustomError';
    Object.setPrototypeOf(this, CustomError.prototype);
  }
}

export const isValidAddress = (address: string): boolean => {
  let isValid;
  try {
    isValid = Cardano.isAddress(address);
  } catch (error) {
    isValid = false;
  }
  return isValid;
};

export const validateWalletName = (value: string): string => {
  if (!value) return 'Name is missing';
  if (hasWhiteSpace(value)) return 'Name has white space';
  if (value.length > MAX_ADDRESS_BOOK_NAME_LENGTH) {
    return `Name is too long (max: ${MAX_ADDRESS_BOOK_NAME_LENGTH})`;
  }
  return '';
};

export const validateWalletAddress = (address: string): string => {
  if (!address) return 'Address is missing';
  if (hasWhiteSpace(address)) return 'Address has white space';
  const isValid = isValidAddress(address);
  return !isValid ? 'Invalid Cardano address' : '';
};

type ValidateWalletHandleArgs = {
  value: string;
  handleResolver: HandleProvider;
};

export const validateWalletHandle = async ({ value, handleResolver }: ValidateWalletHandleArgs): Promise<string> => {
  if (!Asset.util.isValidHandle(value.slice(1).toLowerCase())) {
    throw new Error('Invalid handle');
  }

  const response = await verifyHandle(value, handleResolver);

  if (!response.valid) {
    throw new Error('Incorrect handle');
  }
  return '';
};

type EnsureHandleOwnerHasntChangedArgs = {
  force?: boolean;
  handleResolution: HandleResolution;
  handleResolver: HandleProvider;
};

export const ensureHandleOwnerHasntChanged = async ({
  force,
  handleResolution,
  handleResolver
}: EnsureHandleOwnerHasntChangedArgs): Promise<void> => {
  if (Cardano.isAddress(handleResolution.handle)) {
    return;
  }

  const { handle, cardanoAddress } = handleResolution;
  const resolvedHandle = await handleResolver.resolveHandles({ force, handles: [handle] });

  if (!resolvedHandle[0]) {
    throw new CustomError('Incorrect handle', false);
  }

  if (!Cardano.util.addressesShareAnyKey(cardanoAddress, resolvedHandle[0].cardanoAddress)) {
    throw new CustomConflictError({
      message: `Handle conflict: expected ${cardanoAddress}, got ${resolvedHandle[0].cardanoAddress}`,
      expectedAddress: cardanoAddress,
      actualAddress: resolvedHandle[0].cardanoAddress
    });
  }
};

// Popup view specific validations
export const validateAddressBookName = (value: string): { valid: boolean; message?: string } =>
  value.length > MAX_ADDRESS_BOOK_NAME_LENGTH
    ? {
        valid: false,
        message: `Name too long (max: ${MAX_ADDRESS_BOOK_NAME_LENGTH})`
      }
    : { valid: true };

export const validateMainnetAddress = (address: string): boolean =>
  // is Shelley era mainnet address
  address.startsWith('addr1') ||
  // is Byron era mainnet Icarus-style address
  address.startsWith('Ae2') ||
  // is Byron era mainnet Daedalus-style address
  address.startsWith('DdzFF') ||
  // address is a handle
  isHandle(address);

export const validateTestnetAddress = (address: string): boolean =>
  address.startsWith('addr_test') ||
  isHandle(address) ||
  (!validateMainnetAddress(address) && Cardano.Address.isValidByron(address));

export const validateAddrPerNetwork: Record<Cardano.NetworkId, (address: string) => boolean> = {
  [Cardano.NetworkId.Mainnet]: (address: string) => validateMainnetAddress(address),
  [Cardano.NetworkId.Testnet]: (address: string) => validateTestnetAddress(address)
};

export const isValidAddressPerNetwork = ({
  address,
  network
}: {
  address: string;
  network: Cardano.NetworkId;
}): boolean => !address || validateAddrPerNetwork[network](address);

export const hasAddressBookItem = (
  list: any[],
  record: any
): [boolean, any | undefined] => {
  const toastParams = { duration: 5000, icon: 'ErrorIcon' };
  if (list.some((item) => item.name === record.name))
    return [
      true,
      {
        text: 'Name already exists',
        ...toastParams
      }
    ];

  if (list.some((item) => item.address === record.address))
    return [
      true,
      {
        text: 'Address already exists',
        ...toastParams
      }
    ];

  return [false, undefined];
};

type AddressToSaveArgs = {
  address: any;
  handleResolver: HandleProvider;
};

export const getAddressToSave = async ({
  address,
  handleResolver
}: AddressToSaveArgs): Promise<any> => {
  if (isHandle(address.address)) {
    const result = await verifyHandle(address.address, handleResolver);
    if (result.valid && result.handles && result.handles[0]) {
      return { ...address, handleResolution: result.handles[0] };
    }
  }

  return address;
};
