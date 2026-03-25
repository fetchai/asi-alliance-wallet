import {
  KeplrIntereactionOptions,
  KeplrSignOptions,
  AminoSignResponse,
  StdSignDoc,
  OfflineAminoSigner,
  StdSignature,
  DirectSignResponse,
  OfflineDirectSigner,
  EthSignType,
  Key,
} from "@keplr-wallet/types";
import { Bech32Address } from "@keplr-wallet/cosmos";
import {
  EnableAccessMsg,
  StatusMsg,
  UnlockWalletMsg,
  SwitchAccountMsg,
  GetNetworkMsg,
  AddNetworkAndSwitchMsg,
  SwitchNetworkByChainIdMsg,
  ListEntriesMsg,
  AddEntryMsg,
  UpdateEntryMsg,
  DeleteEntryMsg,
  RestoreWalletMsg,
  GetChainInfosWithCoreTypesMsg,
  LockKeyRingMsg,
} from "../types/msgs";
import deepmerge from "deepmerge";

import { BACKGROUND_PORT, MessageRequester } from "@keplr-wallet/router";
import { Keplr } from "@keplr-wallet/types";
import {
  FetchBrowserWallet,
  Account,
  AccountsApi,
  NetworksApi,
  SigningApi,
  WalletApi,
  WalletStatus,
  AddressBookApi,
  AddressBookEntry,
  NetworkConfig,
  ChainInfoWithCoreTypes,
} from "@fetchai/wallet-types";

import {
  CosmJSFetchOfflineSigner,
  CosmJSFetchOfflineSignerOnlyAmino,
  CosmJSFetchOfflineSignerOnlyDirect,
} from "../cosmjs";

import Long from "long";

export class FetchWalletApi implements WalletApi {
  constructor(
    public networks: NetworksApi,
    public accounts: AccountsApi,
    public signing: SigningApi,
    public addressBook: AddressBookApi,
    protected readonly requester: MessageRequester,
    public keplr: Keplr
  ) {}

  async status(): Promise<WalletStatus> {
    return await this.requester.sendMessage(BACKGROUND_PORT, new StatusMsg());
  }

  async unlockWallet(): Promise<void> {
    await this.requester.sendMessage(BACKGROUND_PORT, new UnlockWalletMsg());
  }

  async lockWallet(): Promise<void> {
    await this.requester.sendMessage(BACKGROUND_PORT, new LockKeyRingMsg());
  }

  async restoreWallet(): Promise<WalletStatus> {
    return await this.requester.sendMessage(
      BACKGROUND_PORT,
      new RestoreWalletMsg()
    );
  }

  async enable(chainIds: string | string[]): Promise<void> {
    await this.keplr.enable(chainIds);
  }

  async disable(chainIds?: string | string[]): Promise<void> {
    await this.keplr.disable(chainIds);
  }
}

export class FetchAccount implements AccountsApi {
  constructor(
    protected readonly requester: MessageRequester,
    public keplr: Keplr
  ) {}

  async currentAccount(): Promise<Account> {
    const network = await this.requester.sendMessage(
      BACKGROUND_PORT,
      new GetNetworkMsg()
    );
    const chainId = network?.chainId || "";
    const key = await this.keplr.getKey(chainId);
    return { ...key, EVMAddress: key.ethereumHexAddress };
  }

  async switchAccount(address: string): Promise<void> {
    await this.requester.sendMessage(
      BACKGROUND_PORT,
      new SwitchAccountMsg(address)
    );
  }

  async listAccounts(): Promise<Account[]> {
    const network = await this.requester.sendMessage(
      BACKGROUND_PORT,
      new GetNetworkMsg()
    );
    const chainId = network?.chainId || "";
    if (!chainId) {
      return [];
    }

    const accountsResponse: any = await this.keplr.getKeysSettled([chainId]);
    const accounts: Key[] = accountsResponse.map((item: any) => item.value);
    const accountsTransformed = accounts.map((item) => ({
      ...item,
      EVMAddress: item.ethereumHexAddress,
    }));
    return accountsTransformed;
  }

  async getAccount(address: string): Promise<Account | null> {
    const accounts = await this.listAccounts();
    const foundAccount = accounts?.find(
      (item) => item.bech32Address === address || item.EVMAddress === address
    );
    return foundAccount ? foundAccount : null;
  }
}

export class FetchNetworks implements NetworksApi {
  constructor(protected readonly requester: MessageRequester) {}

  async getNetwork(): Promise<ChainInfoWithCoreTypes | undefined> {
    return await this.requester.sendMessage(
      BACKGROUND_PORT,
      new GetNetworkMsg()
    );
  }

  async switchToNetwork(network: NetworkConfig): Promise<void> {
    // Add network
    await this.requester.sendMessage(
      BACKGROUND_PORT,
      new AddNetworkAndSwitchMsg(network)
    );

    // enable access
    await this.requester.sendMessage(
      BACKGROUND_PORT,
      new EnableAccessMsg([network.chainId])
    );
  }

  async switchToNetworkByChainId(chainId: string): Promise<void> {
    await this.requester.sendMessage(
      BACKGROUND_PORT,
      new SwitchNetworkByChainIdMsg(chainId)
    );
  }

  async listNetworks(): Promise<ChainInfoWithCoreTypes[]> {
    const chainInfo = await this.requester.sendMessage(
      BACKGROUND_PORT,
      new GetChainInfosWithCoreTypesMsg()
    );

    return chainInfo.chainInfos;
  }
}

export class FetchSigning implements SigningApi {
  public defaultOptions: KeplrIntereactionOptions = {};

  constructor(
    protected readonly requester: MessageRequester,
    public keplr: Keplr
  ) {}

  async getCurrentKey(chainId: string): Promise<Account> {
    const key = await this.keplr.getKey(chainId);
    return { ...key, EVMAddress: key.ethereumHexAddress };
  }

  async signAmino(
    chainId: string,
    signer: string,
    signDoc: StdSignDoc,
    signOptions: KeplrSignOptions = {}
  ): Promise<AminoSignResponse> {
    return await this.keplr.signAmino(
      chainId,
      signer,
      signDoc,
      deepmerge(this.defaultOptions.sign ?? {}, signOptions)
    );
  }

  async signDirect(
    chainId: string,
    signer: string,
    signDoc: {
      bodyBytes?: Uint8Array | null;
      authInfoBytes?: Uint8Array | null;
      chainId?: string | null;
      accountNumber?: Long | null;
    },
    signOptions: KeplrSignOptions = {}
  ): Promise<DirectSignResponse> {
    return await this.keplr.signDirect(
      chainId,
      signer,
      {
        bodyBytes: signDoc.bodyBytes,
        authInfoBytes: signDoc.authInfoBytes,
        chainId: signDoc.chainId,
        accountNumber: signDoc?.accountNumber,
      },
      deepmerge(this.defaultOptions.sign ?? {}, signOptions)
    );
  }

  async signArbitrary(
    chainId: string,
    signer: string,
    data: string | Uint8Array
  ): Promise<StdSignature> {
    return await this.keplr.signArbitrary(chainId, signer, data);
  }

  async verifyArbitrary(
    chainId: string,
    signer: string,
    data: string | Uint8Array,
    signature: StdSignature
  ): Promise<boolean> {
    return await this.keplr.verifyArbitrary(chainId, signer, data, signature);
  }

  async signEthereum(
    data: string | Uint8Array,
    type: EthSignType
  ): Promise<Uint8Array> {
    [data] = this.getDataForADR36(data);

    const network = await this.requester.sendMessage(
      BACKGROUND_PORT,
      new GetNetworkMsg()
    );
    const chainId = network?.chainId || "";
    const key = await this.getCurrentKey(chainId);

    let signer;
    if (key.bech32Address) {
      signer = key.bech32Address;
    } else {
      signer = new Bech32Address(key.address).toBech32(
        network?.bech32Config?.bech32PrefixAccAddr || ""
      );
    }

    if (data === "") {
      throw new Error("Signing empty data is not supported.");
    }
    return await this.keplr.signEthereum(chainId, signer, data, type);
  }

  async getOfflineSigner(
    chainId: string
  ): Promise<OfflineDirectSigner | OfflineAminoSigner> {
    return new CosmJSFetchOfflineSigner(chainId, this);
  }

  async getOfflineDirectSigner(chainId: string): Promise<OfflineDirectSigner> {
    return new CosmJSFetchOfflineSignerOnlyDirect(chainId, this);
  }

  async getOfflineAminoSigner(chainId: string): Promise<OfflineAminoSigner> {
    return new CosmJSFetchOfflineSignerOnlyAmino(chainId, this);
  }

  protected getDataForADR36(data: string | Uint8Array): [string, boolean] {
    let isADR36WithString = false;
    if (typeof data === "string") {
      data = Buffer.from(data).toString("base64");
      isADR36WithString = true;
    } else {
      data = Buffer.from(data).toString("base64");
    }
    return [data, isADR36WithString];
  }

  protected getADR36SignDoc(signer: string, data: string): StdSignDoc {
    return {
      chain_id: "",
      account_number: "0",
      sequence: "0",
      fee: {
        gas: "0",
        amount: [],
      },
      msgs: [
        {
          type: "sign/MsgSignData",
          value: {
            signer,
            data,
          },
        },
      ],
      memo: "",
    };
  }
}

export class FetchAddressBook implements AddressBookApi {
  constructor(protected readonly requester: MessageRequester) {}

  async listEntries(): Promise<AddressBookEntry[]> {
    return await this.requester.sendMessage(
      BACKGROUND_PORT,
      new ListEntriesMsg()
    );
  }

  async addEntry(entry: AddressBookEntry): Promise<void> {
    await this.requester.sendMessage(BACKGROUND_PORT, new AddEntryMsg(entry));
  }

  async updateEntry(entry: AddressBookEntry): Promise<void> {
    await this.requester.sendMessage(
      BACKGROUND_PORT,
      new UpdateEntryMsg(entry)
    );
  }

  async deleteEntry(address: string): Promise<void> {
    await this.requester.sendMessage(
      BACKGROUND_PORT,
      new DeleteEntryMsg(address)
    );
  }
}

export class ExtensionCoreFetchWallet implements FetchBrowserWallet {
  readonly keplr: Keplr;
  readonly version: string;
  readonly wallet: WalletApi;

  constructor(keplr: Keplr, version: string, _requester: MessageRequester) {
    this.keplr = keplr;
    this.version = version;
    this.wallet = new FetchWalletApi(
      new FetchNetworks(_requester),
      new FetchAccount(_requester, this.keplr),
      new FetchSigning(_requester, this.keplr),
      new FetchAddressBook(_requester),
      _requester,
      this.keplr
    );
  }
}
