import { SignMode } from "@keplr-wallet/background";
import { PubKey } from "@keplr-wallet/types";
import { Dispatch, SetStateAction } from "react";
import {
  AccountSetBase,
  CosmosAccount,
  CosmwasmAccount,
  SecretAccount,
  EthereumAccount,
} from "@keplr-wallet/stores";

type SigningMode = "direct" | "amino";

export type PublicKey = { "@type": string; key: string };

export type TxnDocType = "signature" | "transaction";

export interface MultisigAccountErrorParams {
  multisigAccount: string;
  offlineSigning: boolean;
  bech32Prefix: string;
  multiSigPubKeys: string;
  accountData?: {
    account?: {
      pub_key?: unknown;
    };
  } | null;
}

export interface MultisigPublicKeySectionProps {
  multiSigAccountError: boolean;
  multisigAccount: string;
  offlineSigning: boolean;
  broadcastTxn: boolean;
  accountPubKey?: {
    key?: {
      threshold?: number;
    };
  };
  multiSigPubKeys: string;
  pubKeyError?: string;
  threshold: number | undefined;
  handlePubkeysChange: (value: string) => void;
  handleThresholdChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setMultiSigPubKeys: (value: string) => void;
  setPubKeyError: (value: string) => void;
  showNotification: (message: string, type: "danger" | "success") => void;
}

export interface BaseTxnFileParams {
  accountName: string;
  accountNumber: string;
  sequence: string;
  fileName?: string;
}

export type GetTxnDocFileNameParams = BaseTxnFileParams & {
  type: TxnDocType;
};

export interface SignerFormProps {
  chainId: string;
  account: AccountSetBase &
    CosmosAccount &
    CosmwasmAccount &
    SecretAccount &
    EthereumAccount;
  signManualTxn: SignManualTxn;
  showNotification: (message: string, type?: any) => void;
}

export type UpdateSignerInfoParams = {
  signerInfos: ProtoUnsignedTx["auth_info"]["signer_infos"];
  signingMode: SigningMode;
  sequence: string;
  pubKey: PubKey | ProtoMultisigPubkey;
  isMultisig: boolean;
  signerIndex?: number;
};

export type SingleSignature = {
  public_key: PublicKey;
  data: {
    single: {
      mode: string;
      signature: string;
    };
  };
  sequence: string;
};

export type ProtoMultisigPubkey = {
  "@type": "/cosmos.crypto.multisig.LegacyAminoPubKey";
  threshold: number;
  public_keys: Array<PublicKey>;
};

export type MultisigPubKey = {
  threshold: number;
  pubKeys: Array<PublicKey>;
};

export type ProtoUnsignedTx = {
  body: {
    messages: any[];
    memo?: string;
    timeout_height?: string;
    extension_options?: any[];
    non_critical_extension_options?: any[];
  };
  auth_info: {
    signer_infos: any[];
    fee: {
      amount: {
        denom: string;
        amount: string;
      }[];
      gas_limit: string;
      payer?: string;
      granter?: string;
    };
  };
};

export type SignDocParams = {
  chainId: string;
  accountNumber: string;
  sequence: string;
};

export interface SignDocData {
  payloadObj: any;
  signDocType: string;
  signDocParams: {
    chainId: string;
    sequence: number;
    accountNumber: number;
  };
  signDoc: any;
}

export type InputDocType = "amino" | "proto-json";

export enum SignAction {
  SIGN = "sign",
  SIGN_AND_BROADCAST = "sign_and_broadcast",
}

export enum MultiSigSteps {
  Transaction = "Transaction",
  Signatures = "Signatures",
  ReviewAndBroadcast = "Review And Broadcast",
}

export type SignManualTxn = (
  signType: TxnType,
  signDoc: unknown,
  signDocParams: unknown,
  onSignSuccess: (
    signDocParams: unknown,
    result: unknown,
    fileNames: any
  ) => void,
  fileNames: any
) => Promise<void>;

export type TxnType = SignMode.Amino | SignMode.Direct;

export interface TransactionSectionProps {
  type?: "single" | "multi";
  broadcastTxn: boolean;
  offlineSigning: boolean;
  setTxnFileName: React.Dispatch<React.SetStateAction<string>>;
  setOfflineSigning: React.Dispatch<React.SetStateAction<boolean>>;
  chainId: string;
  address: string;
  accountName: string;
  multisigAccount?: string;
  multiSigAccountError?: string;
  onMultisigAccountChange?: (e: any) => void;
  txnPayload: string;
  payloadError: string;
  setPayloadError: React.Dispatch<React.SetStateAction<string>>;
  overrideSigner: boolean;
  setOverrideSigner: React.Dispatch<React.SetStateAction<boolean>>;
  accountInfo: {
    accountNumber: string;
    sequence: string;
  };
  setAccountInfo: React.Dispatch<
    React.SetStateAction<{
      accountNumber: string;
      sequence: string;
    }>
  >;
  onTxnSignDocChange: (value: string) => void;
  showNotification: (message: string, type?: any) => void;
}

export interface MultiSignaturesProps {
  multiSignatures: string[];
  signaturesCollected: boolean;
  threshold: number | undefined;
  assembleFinalMultiSigTxn: () => void;
  pubKeyMultisigAccount?: any[];
  setMultiSignatures: Dispatch<SetStateAction<string[]>>;
  showNotification: (message: string, type: any) => void;
}
