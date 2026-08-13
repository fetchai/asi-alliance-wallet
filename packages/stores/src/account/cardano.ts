import { AccountSetBaseSuper, AccountSetBase } from "./base";
import { ChainGetter } from "../common";
import { ActivityStore } from "../activity";
import { TokenGraphStore } from "../token-graph";
import { CosmosAccount } from "./cosmos";
import { CosmwasmAccount } from "./cosmwasm";
import { SecretAccount } from "./secret";
import { EthereumAccount } from "./ethereum";
import { AppCurrency } from "@keplr-wallet/types";
import { CardanoSendAdapter } from "../cardano/send-adapter";
import { MessageRequester } from "@keplr-wallet/router";
import { DenomHelper } from "@keplr-wallet/common";
import type { CardanoNetwork } from "@keplr-wallet/cardano";
import { CARDANO_NATIVE_TOKEN_TYPE } from "../query/cardano/token-balance-registry";

export interface CardanoAccount {
  readonly isCardano: boolean;
}

export class CardanoAccountImpl {
  private readonly sendAdapter: CardanoSendAdapter;

  constructor(
    protected readonly base: AccountSetBase,
    protected readonly chainGetter: ChainGetter,
    protected readonly chainId: string,
    protected readonly messageRequester: MessageRequester
  ) {
    this.sendAdapter = new CardanoSendAdapter(messageRequester, chainId);

    // Register send token transaction handler for Cardano
    this.base.registerMakeSendTokenFn((amount, currency, recipient) => {
      return this.processMakeSendTokenTx(
        amount,
        currency,
        recipient,
        this.sendAdapter
      );
    });
  }

  protected processMakeSendTokenTx(
    amount: string,
    currency: AppCurrency,
    recipient: string,
    sendAdapter: CardanoSendAdapter
  ) {
    const chainInfo = this.chainGetter.getChain(this.chainId);
    const isCardano = chainInfo.features?.includes("cardano") ?? false;

    // Only handle if this is a Cardano chain
    if (!isCardano) {
      return undefined;
    }

    const denomHelper = new DenomHelper(currency.coinMinimalDenom);

    // Handle both native ADA and cardanonative tokens
    if (
      denomHelper.type !== "native" &&
      denomHelper.type !== CARDANO_NATIVE_TOKEN_TYPE
    ) {
      return undefined;
    }

    // Delegate to send adapter (handles both ADA and native tokens)
    return sendAdapter.makeSendTokenTx(amount, currency, recipient);
  }
}

export const CardanoAccount = {
  use(options: {
    messageRequester: MessageRequester;
  }): (
    base: AccountSetBaseSuper &
      CosmosAccount &
      CosmwasmAccount &
      SecretAccount &
      EthereumAccount,
    chainGetter: ChainGetter,
    chainId: string,
    _activityStore: ActivityStore,
    _tokenGraphStore: TokenGraphStore
  ) => CardanoAccount {
    return (base, chainGetter, chainId, _activityStore, _tokenGraphStore) => {
      // CardanoAccountImpl registers handler internally
      new CardanoAccountImpl(
        base,
        chainGetter,
        chainId,
        options.messageRequester
      );

      return {
        isCardano: true,
      };
    };
  },
};

export interface CardanoAccountMixin {
  cardanoWalletManager?: any;
}

export const CardanoAccountMixin = {
  use(options?: {
    mnemonicWords: string[];
    accountIndex?: number;
    network?: CardanoNetwork;
    blockfrostApiKey?: string;
  }): (
    _base: AccountSetBaseSuper &
      CosmosAccount &
      CosmwasmAccount &
      SecretAccount &
      EthereumAccount,
    _chainGetter: ChainGetter,
    _chainId: string,
    _activityStore: ActivityStore,
    _tokenGraphStore: TokenGraphStore
  ) => Promise<CardanoAccountMixin> {
    return async (
      _base,
      _chainGetter,
      _chainId,
      _activityStore,
      _tokenGraphStore
    ) => {
      let cardanoWalletManager;
      if (options) {
        const { CardanoWalletManager } = await import("@keplr-wallet/cardano");

        let network: CardanoNetwork = "mainnet";
        if (options.network) {
          network = options.network;
        } else {
          const { getCardanoNetworkFromChainId } = await import(
            "@keplr-wallet/cardano"
          );
          network = getCardanoNetworkFromChainId(_chainId);
        }

        cardanoWalletManager = await CardanoWalletManager.create({
          mnemonicWords: options.mnemonicWords,
          accountIndex: options.accountIndex,
          network,
        });
      }
      return { cardanoWalletManager };
    };
  },
};
