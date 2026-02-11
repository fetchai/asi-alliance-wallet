import { SignMode } from "@keplr-wallet/background";
import { PubKey } from "@keplr-wallet/types";

type SigningMode = "direct" | "amino";

export type PublicKey = { "@type": string; key: string };

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
  onSignSuccess: (signDocParams: unknown, result: unknown) => void
) => Promise<void>;

export type TxnType = SignMode.Amino | SignMode.Direct;
