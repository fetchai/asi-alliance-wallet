import { AccountSetBase, WalletStatus } from "./base";
import { ChainStore } from "../chain";
import { AppCurrency, ChainInfo } from "@keplr-wallet/types";
import { MockKeplr } from "@keplr-wallet/provider-mock";
import { KVStore } from "@keplr-wallet/common";

class MockKVStore implements KVStore {
  private store: Map<string, any> = new Map();
  private prefixValue: string = "mock-prefix";

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set<T = unknown>(key: string, data: T | null): Promise<void> {
    if (data === null) {
      this.store.delete(key);
    } else {
      this.store.set(key, data);
    }
  }

  prefix(): string {
    return this.prefixValue;
  }
}

const accountBaseKVStore = new MockKVStore();

describe("Test Account set base", () => {
  test("Account set base should be inited automatically if `autoInit` is true", async () => {
    const chainInfos: {
      readonly chainId: string;
      readonly bech32Config: {
        readonly bech32PrefixAccAddr: string;
      };
      readonly currencies: AppCurrency[];
    }[] = [
      {
        chainId: "test",
        bech32Config: {
          bech32PrefixAccAddr: "cosmos",
        },
        currencies: [],
      },
    ];
    const chainStore = new ChainStore(chainInfos as ChainInfo[]);

    const accountSetBase = new AccountSetBase(
      {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        addEventListener: () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        removeEventListener: () => {},
      },
      chainStore,
      "test",
      {
        suggestChain: false,
        autoInit: true,
        getKeplr: async () => {
          return new MockKeplr(
            async () => {
              return new Uint8Array(0);
            },
            chainInfos,
            "curious kitchen brief change imitate open close knock cause romance trim offer"
          );
        },
      },
      accountBaseKVStore
    );

    expect(accountSetBase.walletStatus).toBe(WalletStatus.Loading);

    // Need wait some time to get the Keplr.
    await (() => {
      return new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      });
    })();

    expect(accountSetBase.walletStatus).toBe(WalletStatus.Loaded);
    expect(accountSetBase.bech32Address).toBe(
      "cosmos1unx0p9jv79xz278xuk7uuuwj2l99k2sp4vm8wp"
    );
    expect(accountSetBase.isReadyToSendTx).toBe(true);
  });

  test("Account set base should not be inited automatically if `autoInit` is false", async () => {
    const chainInfos: {
      readonly chainId: string;
      readonly bech32Config: {
        readonly bech32PrefixAccAddr: string;
      };
      readonly currencies: AppCurrency[];
    }[] = [
      {
        chainId: "test",
        bech32Config: {
          bech32PrefixAccAddr: "cosmos",
        },
        currencies: [],
      },
    ];
    const chainStore = new ChainStore(chainInfos as ChainInfo[]);

    const accountSetBase = new AccountSetBase(
      {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        addEventListener: () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        removeEventListener: () => {},
      },
      chainStore,
      "test",
      {
        suggestChain: false,
        autoInit: false,
        getKeplr: async () => {
          return new MockKeplr(
            async () => {
              return new Uint8Array(0);
            },
            chainInfos,
            "curious kitchen brief change imitate open close knock cause romance trim offer"
          );
        },
      },
      accountBaseKVStore
    );

    expect(accountSetBase.walletStatus).toBe(WalletStatus.NotInit);

    // Need wait some time to get the Keplr.
    await (() => {
      return new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      });
    })();

    expect(accountSetBase.walletStatus).toBe(WalletStatus.NotInit);
  });
});
