import { ActivityStore } from "src/activity";
import {
  ChainedFunctionifyTuple,
  ChainGetter,
  HasMapStore,
  IObject,
  mergeStores,
} from "../common";
import { AccountSetBase, AccountSetBaseSuper, AccountSetOpts } from "./base";
import { DeepReadonly, UnionToIntersection } from "utility-types";
import { TokenGraphStore } from "src/token-graph";
import { KVStore } from "@keplr-wallet/common";

// eslint-disable-next-line @typescript-eslint/ban-types
export interface IAccountStore<T extends IObject = {}> {
  getAccount(chainId: string): DeepReadonly<AccountSetBase & T>;
}

export class AccountStore<
  Injects extends Array<IObject>,
  AccountSetReturn = AccountSetBase & UnionToIntersection<Injects[number]>
> extends HasMapStore<AccountSetReturn> {
  protected accountSetCreators: ChainedFunctionifyTuple<
    AccountSetBaseSuper,
    // chainGetter: ChainGetter,
    // chainId: string,
    [ChainGetter, string, ActivityStore, TokenGraphStore],
    Injects
  >;

  constructor(
    protected readonly eventListener: {
      addEventListener: (type: string, fn: () => unknown) => void;
      removeEventListener: (type: string, fn: () => unknown) => void;
    },
    protected readonly chainGetter: ChainGetter,
    protected readonly activityStore: ActivityStore,
    protected readonly tokenGraphStore: TokenGraphStore,
    protected readonly accountBaseStore: KVStore,
    protected readonly storeOptsCreator: (chainId: string) => AccountSetOpts,
    ...accountSetCreators: ChainedFunctionifyTuple<
      AccountSetBaseSuper,
      // chainGetter: ChainGetter,
      // chainId: string,
      [ChainGetter, string, ActivityStore, TokenGraphStore],
      Injects
    >
  ) {
    super((chainId: string) => {
      const accountSetBase = new AccountSetBaseSuper(
        eventListener,
        chainGetter,
        chainId,
        storeOptsCreator(chainId),
        this.accountBaseStore
      );

      return mergeStores(
        accountSetBase,
        [this.chainGetter, chainId, this.activityStore, this.tokenGraphStore],
        ...this.accountSetCreators
      );
    });

    this.accountSetCreators = accountSetCreators;
  }

  getAccount(chainId: string): AccountSetReturn {
    return this.get(chainId);
  }

  hasAccount(chainId: string): boolean {
    return this.has(chainId);
  }
}
