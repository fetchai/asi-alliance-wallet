import { AccountSetBaseSuper } from "./base";
import { ChainGetter } from "../common";
import { ActivityStore } from "../activity";
import { TokenGraphStore } from "../token-graph";
import { CosmosAccount } from "./cosmos";
import { CosmwasmAccount } from "./cosmwasm";
import { SecretAccount } from "./secret";
import { EthereumAccount } from "./ethereum";

export interface CardanoAccount {
  readonly isCardano: boolean;
}

export const CardanoAccount = {
  use(): (
    _base: AccountSetBaseSuper & CosmosAccount & CosmwasmAccount & SecretAccount & EthereumAccount,
    _chainGetter: ChainGetter,
    _chainId: string,
    _activityStore: ActivityStore,
    _tokenGraphStore: TokenGraphStore
  ) => CardanoAccount {
    return () => ({ isCardano: true });
  },
};

export interface CardanoAccountMixin {
  cardanoWalletManager?: any;
}

export const CardanoAccountMixin = {
  use(
    options?: { mnemonicWords: string[]; accountIndex?: number; network?: 'mainnet' | 'testnet'; blockfrostApiKey?: string }
  ): (
    _base: AccountSetBaseSuper & CosmosAccount & CosmwasmAccount & SecretAccount & EthereumAccount,
    _chainGetter: ChainGetter,
    _chainId: string,
    _activityStore: ActivityStore,
    _tokenGraphStore: TokenGraphStore
  ) => Promise<CardanoAccountMixin> {
    return async (_base, _chainGetter, _chainId, _activityStore, _tokenGraphStore) => {
      let cardanoWalletManager;
      if (options) {
        const { CardanoWalletManager } = await import("@keplr-wallet/cardano");
        

        let network: 'mainnet' | 'testnet' = 'mainnet';
        if (options.network) {
          network = options.network;
        } else {

          const { getCardanoNetworkFromChainId } = await import("@keplr-wallet/cardano");
          network = getCardanoNetworkFromChainId(_chainId);
        }
        
        cardanoWalletManager = await CardanoWalletManager.create({
          mnemonicWords: options.mnemonicWords,
          accountIndex: options.accountIndex,
          network
        });
      }
      return { cardanoWalletManager };
    };
  },
}; 