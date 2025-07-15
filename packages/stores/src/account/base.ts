import { action, computed, flow, makeObservable, observable } from "mobx";
import {
  AppCurrency,
  Keplr,
  KeplrSignOptions,
  StdFee,
} from "@keplr-wallet/types";
import { ChainGetter } from "../common";
import { KVStore, DenomHelper, toGenerator } from "@keplr-wallet/common";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { MakeTxResponse } from "./types";
import { Int } from "@keplr-wallet/unit";

export enum WalletStatus {
  NotInit = "NotInit",
  Loading = "Loading",
  Loaded = "Loaded",
  NotExist = "NotExist",
  Rejected = "Rejected",
}

export interface MsgOpt {
  readonly type: string;
  readonly gas: number;
}

export interface AccountSetOpts {
  readonly suggestChain: boolean;
  readonly suggestChainFn?: (
    keplr: Keplr,
    chainInfo: ReturnType<ChainGetter["getChain"]>
  ) => Promise<void>;
  readonly autoInit: boolean;
  readonly getKeplr: () => Promise<Keplr | undefined>;
}

export class AccountSetBase {
  @observable
  protected _walletVersion: string | undefined = undefined;

  @observable
  protected _walletStatus: WalletStatus = WalletStatus.NotInit;

  @observable.ref
  protected _rejectionReason: Error | undefined = undefined;

  @observable
  protected _name: string = "";

  @observable
  protected _bech32Address: string = "";

  @observable
  protected _customSequence: Int = new Int(0);

  @observable
  protected _isNanoLedger: boolean = false;
  @observable
  protected _isKeystone: boolean = false;

  @observable
  protected _txTypeInProgress: string = "";

  @observable
  protected _broadcastInProgress: boolean = false;

  @observable
  protected _txInProgress: string = "";

  protected _pubKey: Uint8Array;

  protected hasInited = false;

  protected sendTokenFns: ((
    amount: string,
    currency: AppCurrency,
    recipient: string,
    memo: string,
    stdFee: Partial<StdFee>,
    signOptions?: KeplrSignOptions,
    onTxEvents?:
      | ((tx: any) => void)
      | {
          onBroadcastFailed?: (e?: Error) => void;
          onBroadcasted?: (txHash: Uint8Array) => void;
          onFulfill?: (tx: any) => void;
        }
  ) => Promise<boolean>)[] = [];

  protected makeSendTokenTxFns: ((
    amount: string,
    currency: AppCurrency,
    recipient: string
  ) => MakeTxResponse | undefined)[] = [];

  constructor(
    protected readonly eventListener: {
      addEventListener: (type: string, fn: () => unknown) => void;
      removeEventListener: (type: string, fn: () => unknown) => void;
    },
    protected readonly chainGetter: ChainGetter,
    protected readonly chainId: string,
    protected readonly opts: AccountSetOpts,
    protected readonly kvStore: KVStore
  ) {
    makeObservable(this);

    this._pubKey = new Uint8Array();

    if (opts.autoInit) {
      this.init();
    }
  }

  getKeplr(): Promise<Keplr | undefined> {
    return this.opts.getKeplr();
  }

  registerSendTokenFn(
    fn: (
      amount: string,
      currency: AppCurrency,
      recipient: string,
      memo: string,
      stdFee: Partial<StdFee>,
      signOptions?: KeplrSignOptions,
      onTxEvents?:
        | ((tx: any) => void)
        | {
            onBroadcasted?: (txHash: Uint8Array) => void;
            onFulfill?: (tx: any) => void;
          }
    ) => Promise<boolean>
  ) {
    this.sendTokenFns.push(fn);
  }

  registerMakeSendTokenFn(
    fn: (
      amount: string,
      currency: AppCurrency,
      recipient: string
    ) => MakeTxResponse | undefined
  ) {
    this.makeSendTokenTxFns.push(fn);
  }

  protected async enable(keplr: Keplr, chainId: string): Promise<void> {
    const chainInfo = this.chainGetter.getChain(chainId);

    if (this.opts.suggestChain) {
      if (this.opts.suggestChainFn) {
        await this.opts.suggestChainFn(keplr, chainInfo);
      } else {
        await this.suggestChain(keplr, chainInfo);
      }
    }
    
    // Check if KeyRing is ready before calling enable
    // This prevents "No keys available" errors during initialization
    try {
      await keplr.enable(chainId);
    } catch (e) {
      // If enable fails due to no keys, don't throw - just return
      // The getKey call below will handle the error appropriately
      if (e.message && (
        e.message.includes("No keys available") || 
        e.message.includes("key doesn't exist") ||
        e.message.includes("Please create a wallet first")
      )) {
        return; // Don't throw, let getKey handle it
      }
      throw e; // Re-throw other errors
    }
  }

  protected async suggestChain(
    keplr: Keplr,
    chainInfo: ReturnType<ChainGetter["getChain"]>
  ): Promise<void> {
    await keplr.experimentalSuggestChain(chainInfo.raw);
  }

  private readonly handleInit = () => this.init();

  @flow
  public *init(): Generator<any, void, any> {
    // If wallet status is not exist, there is no need to try to init because it always fails.
    if (this.walletStatus === WalletStatus.NotExist) {
      return;
    }

    // If the store has never been initialized, add the event listener.
    if (!this.hasInited) {
      // If key store in the keplr extension is changed, this event will be dispatched.
      this.eventListener.addEventListener(
        "keplr_keystorechange",
        this.handleInit
      );
    }
    this.hasInited = true;

    // Set wallet status as loading whenever try to init.
    this._walletStatus = WalletStatus.Loading;

    const keplr = yield* toGenerator(this.getKeplr());
    if (!keplr) {
      this._walletStatus = WalletStatus.NotExist;
      return;
    }

    this._walletVersion = keplr.version;

    try {
      yield this.enable(keplr, this.chainId);
    } catch (e) {
      console.log(e);
      this._walletStatus = WalletStatus.Rejected;
      this._rejectionReason = e;
      return;
    }

    try {
      const key = yield* toGenerator(keplr.getKey(this.chainId));
      this._bech32Address = key.bech32Address;
      this._isNanoLedger = key.isNanoLedger;
      this._isKeystone = key.isKeystone;
      this._name = key.name;
      this._pubKey = key.pubKey;

      if (this._bech32Address) {
        const savedTxnNonce =
          (yield* toGenerator(
            this.kvStore.get<any>(
              `extension_txn_nonce-${this.bech32Address}-${this.chainId}`
            )
          )) || 0;
        this._customSequence = new Int(savedTxnNonce);
      }

      // Set the wallet status as loaded after getting all necessary infos.
      this._walletStatus = WalletStatus.Loaded;
    } catch (e) {
      console.log(e);
      
      if (e.message && (
        e.message.includes("No keys available") || 
        e.message.includes("key doesn't exist") ||
        e.message.includes("Please create a wallet first")
      )) {
        this._bech32Address = "";
        this._isNanoLedger = false;
        this._isKeystone = false;
        this._name = "";
        this._pubKey = new Uint8Array(0);
        this._walletStatus = WalletStatus.NotExist;
        this._rejectionReason = undefined;
        return;
      }
      this._bech32Address = "";
      this._isNanoLedger = false;
      this._isKeystone = false;
      this._name = "";
      this._pubKey = new Uint8Array(0);
      this._walletStatus = WalletStatus.Rejected;
      this._rejectionReason = e;
    }

    if (this._walletStatus !== WalletStatus.Rejected) {
      // Reset previous rejection error message
      this._rejectionReason = undefined;
    }
  }

  @action
  public disconnect(): void {
    this._walletStatus = WalletStatus.NotInit;
    this.hasInited = false;
    this.eventListener.removeEventListener(
      "keplr_keystorechange",
      this.handleInit
    );
    this._bech32Address = "";
    this._isNanoLedger = false;
    this._isKeystone = false;
    this._name = "";
    this._pubKey = new Uint8Array(0);
    this._rejectionReason = undefined;
  }

  get walletVersion(): string | undefined {
    return this._walletVersion;
  }

  @computed
  get isReadyToSendTx(): boolean {
    return (
      this.walletStatus === WalletStatus.Loaded && this.bech32Address !== ""
    );
  }

  /**
   * @deprecated Use `isReadyToSendTx`
   */
  @computed
  get isReadyToSendMsgs(): boolean {
    return (
      this.walletStatus === WalletStatus.Loaded && this.bech32Address !== ""
    );
  }

  makeSendTokenTx(
    amount: string,
    currency: AppCurrency,
    recipient: string
  ): MakeTxResponse {
    for (let i = 0; i < this.makeSendTokenTxFns.length; i++) {
      const fn = this.makeSendTokenTxFns[i];

      const res = fn(amount, currency, recipient);
      if (res) {
        return res;
      }
    }

    const denomHelper = new DenomHelper(currency.coinMinimalDenom);

    throw new Error(`Unsupported type of currency (${denomHelper.type})`);
  }

  async sendToken(
    amount: string,
    currency: AppCurrency,
    recipient: string,
    memo: string = "",
    stdFee: Partial<StdFee> = {},
    signOptions?: KeplrSignOptions,
    onTxEvents?:
      | ((tx: any) => void)
      | {
          onBroadcasted?: (txHash: Uint8Array) => void;
          onFulfill?: (tx: any) => void;
        }
  ) {
    for (let i = 0; i < this.sendTokenFns.length; i++) {
      const fn = this.sendTokenFns[i];

      if (
        await fn(
          amount,
          currency,
          recipient,
          memo,
          stdFee,
          signOptions,
          onTxEvents
        )
      ) {
        return;
      }
    }

    const denomHelper = new DenomHelper(currency.coinMinimalDenom);

    throw new Error(`Unsupported type of currency (${denomHelper.type})`);
  }

  get walletStatus(): WalletStatus {
    return this._walletStatus;
  }

  get rejectionReason(): Error | undefined {
    return this._rejectionReason;
  }

  get name(): string {
    return this._name;
  }

  get bech32Address(): string {
    return this._bech32Address;
  }

  get customSequence(): Int {
    return this._customSequence;
  }

  get pubKey(): Uint8Array {
    return this._pubKey.slice();
  }

  get isNanoLedger(): boolean {
    return this._isNanoLedger;
  }

  get isKeystone(): boolean {
    return this._isKeystone;
  }

  /**
   * Returns the tx type in progress waiting to be committed.
   * If there is no tx type in progress, this returns an empty string ("").
   */
  get txTypeInProgress(): string {
    return this._txTypeInProgress;
  }

  get txInProgress(): string {
    return this._txInProgress;
  }

  get broadcastInProgress(): boolean {
    return this._broadcastInProgress;
  }

  /**
   * @deprecated Use `txTypeInProgress`
   */
  get isSendingMsg(): string | boolean {
    return this.txTypeInProgress;
  }

  get hasEthereumHexAddress(): boolean {
    return (
      this.chainGetter
        .getChain(this.chainId)
        .features?.includes("eth-address-gen") ?? false
    );
  }

  @computed
  get ethereumHexAddress(): string {
    if (this.bech32Address === "") {
      return "";
    }

    return Bech32Address.fromBech32(
      this.bech32Address,
      this.chainGetter.getChain(this.chainId).bech32Config.bech32PrefixAccAddr
    ).toHex(true);
  }

  @action
  setCustomNonce(nonce: Int): void {
    let newNonce = new Int(0);
    if (nonce.gt(this._customSequence)) {
      newNonce = nonce;
    } else {
      newNonce = this._customSequence;
    }
    this._customSequence = newNonce;
    this.saveNonce();
  }

  @action
  increaseCustomSequence(): void {
    this._customSequence = this._customSequence.add(new Int(1));
    this.saveNonce();
  }

  @flow
  *saveNonce() {
    yield this.kvStore.set<any>(
      `extension_txn_nonce-${this._bech32Address}-${this.chainId}`,
      JSON.parse(JSON.stringify(this._customSequence.toString()))
    );
  }

  @action
  resetCustomNonce(nonce: Int): void {
    this._customSequence = nonce;
    this.saveNonce();
  }
}

export class AccountSetBaseSuper extends AccountSetBase {
  constructor(...params: ConstructorParameters<typeof AccountSetBase>) {
    super(...params);

    makeObservable(this);
  }

  @action
  setTxTypeInProgress(type: string): void {
    this._txTypeInProgress = type;
  }

  @action
  setBroadcastInProgress(value: boolean): void {
    this._broadcastInProgress = value;
  }

  @action
  setTxInProgress(type: string): void {
    this._txInProgress = type;
  }
}
