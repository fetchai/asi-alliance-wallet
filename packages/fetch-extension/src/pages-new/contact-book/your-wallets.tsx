import React, { FunctionComponent, useEffect, useState } from "react";
import { Card } from "@components-v2/card";
import { SearchBar } from "@components-v2/search-bar";
import { getFilteredWallets } from "@utils/filters";
import { formatAddress } from "@utils/format";
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";
import { useStore } from "../../stores";
import { useNotification } from "@components/notification";
import style from "./style.module.scss";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { ListAccountsMsg } from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { Skeleton } from "@components-v2/skeleton-loader";
import { addressCacheStore } from "../../utils/address-cache-store";
import {
  hasRequiredAddresses,
  mergePartialCacheData,
  normalizeCacheData,
} from "../../utils/cache-validation";
import { isCardanoChain, walletSupportsCardano } from "../../utils";
import { NoResults } from "@components-v2/no-results";

interface YourWalletProps {
  selectWalletFromList: (recipient: string) => void;
  onBackButton: () => void;
}

export const YourWallets: FunctionComponent<YourWalletProps> = observer(
  ({ selectWalletFromList, onBackButton }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [addressesById, setAddressesById] = useState<Record<string, string>>(
      {}
    );
    const [isLoadingAddresses, setIsLoadingAddresses] = useState<boolean>(true);
    const intl = useIntl();
    const notification = useNotification();
    const { chainStore, keyRingStore } = useStore();

    const chainId = chainStore.current.chainId;
    const isEvm = chainStore.current.features?.includes("evm") ?? false;

    const currentWalletIds = keyRingStore.multiKeyStoreInfo.map(
      (ks) => ks.meta?.["__id__"] || ""
    );
    const walletIdsKey = currentWalletIds.join(",");

    const getOptionIcon = (keyStore: any) => {
      if (keyStore.type === "ledger") {
        return require("@assets/svg/wireframe/ledger-indicator.svg");
      }

      if (keyStore.type === "privateKey") {
        if (
          keyStore.meta &&
          keyStore.meta?.["email"] &&
          keyStore.meta?.["socialType"] === "apple"
        ) {
          return require("@assets/svg/wireframe/apple-logo.svg");
        }

        if (
          keyStore.meta &&
          keyStore.meta?.["email"] &&
          keyStore.meta?.["socialType"] === "google"
        ) {
          return require("@assets/svg/wireframe/google-logo.svg");
        }
      }
      return;
    };

    const syncAddressesFromBackground = async (abortSignal?: AbortSignal) => {
      setIsLoadingAddresses(true);
      try {
        const existingCache = addressCacheStore.getCache(chainId);
        const hasAnyCachedAddress =
          Object.keys(existingCache).length > 0 &&
          Object.values(existingCache).some((addr) => Boolean(addr));
        setAddressesById(existingCache);

        const isCurrentChainCardano = isCardanoChain(
          chainStore.getChain(chainId)
        );

        const requiredWalletIds: string[] = isCurrentChainCardano
          ? keyRingStore.multiKeyStoreInfo
              .filter((ks) => walletSupportsCardano(ks))
              .map((ks) => ks.meta?.["__id__"] || "")
          : currentWalletIds;

        const shouldSyncFromBackend =
          Object.keys(existingCache).length === 0 ||
          !hasRequiredAddresses(existingCache, requiredWalletIds);

        if (!shouldSyncFromBackend) {
          setIsLoadingAddresses(false);
          return;
        }

        setIsLoadingAddresses(!hasAnyCachedAddress);
        const requester = new InExtensionMessageRequester();
        const msg = new ListAccountsMsg();
        const result = await requester.sendMessage(BACKGROUND_PORT, msg);

        if (abortSignal?.aborted) {
          return;
        }

        if (result.error) {
          notification.push({
            placement: "top-center",
            type: "danger",
            duration: 4,
            content: result.error,
            canDelete: true,
            transition: { duration: 0.25 },
          });
          setIsLoadingAddresses(false);
          return;
        }

        const { accounts } = result;
        const snapshotWalletIds = [...currentWalletIds];
        const fetchedById: Record<string, string> = {};
        snapshotWalletIds.forEach((walletId, idx) => {
          const account = accounts[idx];
          if (account && walletId) {
            fetchedById[walletId] = isEvm
              ? account.EVMAddress
              : account.bech32Address;
          }
        });

        await addressCacheStore.atomicCacheUpdate(chainId, (currentCache) => {
          const normalizedCache = normalizeCacheData(
            currentCache,
            snapshotWalletIds
          );
          const fetchedAddresses = snapshotWalletIds.map(
            (id) => fetchedById[id] || ""
          );
          const mergedCache = mergePartialCacheData(
            normalizedCache,
            snapshotWalletIds,
            fetchedAddresses
          );
          return { newCache: mergedCache, result: mergedCache };
        });

        const syncedCache = addressCacheStore.getCache(chainId);
        setAddressesById(syncedCache);
      } finally {
        if (!abortSignal?.aborted) {
          setIsLoadingAddresses(false);
        }
      }
    };

    useEffect(() => {
      const abort = new AbortController();
      syncAddressesFromBackground(abort.signal);
      return () => {
        abort.abort();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [walletIdsKey, chainId]);

    const isCurrentChainCardano = isCardanoChain(chainStore.current);

    const keyRingList = keyRingStore.multiKeyStoreInfo
      .filter((keyStore) => !keyStore.selected)
      .filter((keyStore) => {
        if (!isCurrentChainCardano) return true;
        return walletSupportsCardano(keyStore);
      });

    return (
      <div className={style["container"]}>
        <SearchBar
          valuesArray={keyRingList}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          filterFunction={getFilteredWallets}
          emptyContent={<NoResults />}
          disabled={keyRingList?.length === 0}
          renderResult={(keyStore, i) => {
            const nameByChain = keyStore.meta?.["nameByChain"]
              ? JSON.parse(keyStore.meta["nameByChain"])
              : {};

            const accountName =
              nameByChain?.[chainId] ||
              keyStore.meta?.["name"] ||
              intl.formatMessage({
                id: "setting.keyring.unnamed-account",
              });

            const walletId = keyStore.meta?.["__id__"] || "";
            const address = walletId ? addressesById[walletId] : "";
            const hasAddress = Boolean(address);

            return (
              <Card
                key={i}
                heading={
                  <React.Fragment>
                    {accountName}
                    {getOptionIcon(keyStore) && (
                      <span className={style["rightIconContainer"]}>
                        <img
                          src={getOptionIcon(keyStore)}
                          alt="Right Section"
                          className={style["rightIcon"]}
                        />
                      </span>
                    )}
                  </React.Fragment>
                }
                subheading={
                  hasAddress ? (
                    formatAddress(address)
                  ) : isLoadingAddresses ? (
                    <Skeleton height="14px" width="100px" />
                  ) : (
                    ""
                  )
                }
                style={{
                  padding: "18px 16px",
                }}
                disabled={!hasAddress}
                onClick={async (e: any) => {
                  if (!hasAddress) return;
                  e.preventDefault();
                  selectWalletFromList(address);
                  onBackButton?.();
                }}
              />
            );
          }}
        />
        {keyRingList?.length === 0 && (
          <NoResults
            message="You don’t have any other wallets added"
            styles={{
              height: "320px",
              rowGap: "0px",
            }}
            contentStyles={{
              color: "var(--font-dark)",
              textAlign: "center",
              fontSize: "24px",
              lineHeight: "34px",
              width: "320px",
            }}
            icon={
              <img
                src={require("@assets/svg/wireframe/no-address.svg")}
                alt=""
              />
            }
          />
        )}
      </div>
    );
  }
);
