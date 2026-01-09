export type SingleSignature = {
  public_key: { "@type": string; key: string };
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
  public_keys: Array<{
    "@type": "/cosmos.crypto.secp256k1.PubKey";
    key: string;
  }>;
};

export type MultisigPubKey = {
  threshold: number;
  pubKeys: { "@type": string; key: string }[];
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
