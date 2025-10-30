import React, { FunctionComponent, useState, useEffect, useRef } from "react";

import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";

import { useLoadingIndicator } from "@components/loading-indicator";
import { messageAndGroupListenerUnsubscribe } from "@graphQL/messages-api";
import { Card } from "@components-v2/card";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { formatAddress } from "@utils/format";
import style from "./style.module.scss";
import { CHAIN_ID_FETCHHUB } from "../../config.ui.var";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import {
  ListAccountsMsg,
  MultiKeyStoreInfoWithSelectedElem,
} from "@keplr-wallet/background";
import { Skeleton } from "@components-v2/skeleton-loader";
import {
  normalizeCacheData,
  mergePartialCacheData,
  hasRequiredAddresses,
} from "@utils/cache-validation";
import { addressCacheStore } from "@utils/address-cache-store";
import { App, AppCoinType } from "@keplr-wallet/ledger-cosmos";

interface SetKeyRingProps {
  navigateTo?: any;
  onItemSelect?: () => void;
  setIsOptionsOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSelectWalletOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SetKeyRingPage: FunctionComponent<SetKeyRingProps> = observer(
  ({ navigateTo, onItemSelect, setIsOptionsOpen, setIsSelectWalletOpen }) => {
    const intl = useIntl();
    const navigate = useNavigate();
    const {
      chainStore,
      accountStore,
      keyRingStore,
      analyticsStore,
      chatStore,
      proposalStore,
    } = useStore();

    const chainId = chainStore.current.chainId;
    const accountInfo = accountStore.getAccount(chainStore.current.chainId);
    const loadingIndicator = useLoadingIndicator();
    const [addressesById, setAddressesById] = useState<Record<string, string>>(
      {}
    );
    const [isLoadingAddresses, setIsLoadingAddresses] =
      useState<boolean>(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isLoadingRef = useRef<boolean>(false);

    const currentWalletIds = React.useMemo(
      () =>
        keyRingStore.multiKeyStoreInfo.map((ks) => ks.meta?.["__id__"] || ""),
      [keyRingStore.multiKeyStoreInfo]
    );

    const getAllWalletAddresses = React.useCallback(async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (isLoadingRef.current) {
        return;
      }

      isLoadingRef.current = true;
      setIsLoadingAddresses(true);

      const currentChainId = chainStore.current.chainId;

      try {
        const existingCache = addressCacheStore.getCache(currentChainId);

        const isCurrentChainCardano =
          currentChainId === "cardano-preview" ||
          currentChainId === "cardano-preprod" ||
          currentChainId === "cardano-mainnet";

        const requiredWalletIds: string[] = isCurrentChainCardano
          ? keyRingStore.multiKeyStoreInfo
              .map((ks) => ({
                id: ks.meta?.["__id__"] || "",
                supported:
                  ks.type === "mnemonic" &&
                  `${ks.meta?.["mnemonicLength"]}` === "24",
              }))
              .filter((w) => w.supported)
              .map((w) => w.id)
          : currentWalletIds;

        const shouldSyncFromBackend =
          Object.keys(existingCache).length === 0 ||
          !hasRequiredAddresses(existingCache, requiredWalletIds);

        if (shouldSyncFromBackend) {
          const requester = new InExtensionMessageRequester();

          const msg = new ListAccountsMsg();
          const accounts = await requester.sendMessage(BACKGROUND_PORT, msg);

          const isEvm = chainStore.current.features?.includes("evm") ?? false;
          const snapshotWalletIds = [...currentWalletIds];

          const fetchedById: Record<string, string> = {};
          snapshotWalletIds.forEach((id, idx) => {
            const acc = accounts[idx];
            fetchedById[id] = acc
              ? isEvm
                ? acc.EVMAddress
                : acc.bech32Address
              : "";
          });

          await addressCacheStore.atomicCacheUpdate(
            currentChainId,
            (currentCache) => {
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

              return {
                newCache: mergedCache,
                result: mergedCache,
              };
            }
          );

          const syncedCache = addressCacheStore.getCache(currentChainId);
          setAddressesById(syncedCache);

          isLoadingRef.current = false;
          setIsLoadingAddresses(false);
          return;
        }

        setAddressesById(existingCache);

        isLoadingRef.current = false;
        setIsLoadingAddresses(false);
        return;
      } catch (error) {
        if (error.name === "AbortError") {
          isLoadingRef.current = false;
          setIsLoadingAddresses(false);
          return;
        }

        console.warn(
          "Failed to fetch addresses, keeping cached values:",
          error
        );
      } finally {
        isLoadingRef.current = false;
        setIsLoadingAddresses(false);
      }
    }, [
      chainStore.current.chainId,
      currentWalletIds,
      keyRingStore.multiKeyStoreInfo,
    ]);

    // Serialize wallet IDs for stable dependency comparison
    const walletIdsKey = currentWalletIds.join(",");

    useEffect(() => {
      // Prevent race conditions by checking if component is still mounted
      let isMounted = true;

      const loadAddresses = async () => {
        if (isMounted) {
          await getAllWalletAddresses();
        }
      };

      loadAddresses();

      return () => {
        isMounted = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chainStore.current.chainId, walletIdsKey]);

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

    return (
      <div>
        {keyRingStore.multiKeyStoreInfo.map(
          (keyStore: MultiKeyStoreInfoWithSelectedElem, i: number) => {
            const bip44HDPath = keyStore.bip44HDPath
              ? keyStore.bip44HDPath
              : {
                  account: 0,
                  change: 0,
                  addressIndex: 0,
                };
            let paragraph = keyStore.meta?.["email"]
              ? keyStore.meta["email"]
              : undefined;
            if (keyStore.type === "keystone") {
              paragraph = "Keystone";
            } else if (keyStore.type === "ledger") {
              const coinType = (() => {
                if (
                  keyStore.meta &&
                  keyStore.meta["__ledger__cosmos_app_like__"] &&
                  keyStore.meta["__ledger__cosmos_app_like__"] !== "Cosmos"
                ) {
                  return (
                    AppCoinType[
                      keyStore.meta["__ledger__cosmos_app_like__"] as App
                    ] || 118
                  );
                }

                return 118;
              })();

              paragraph = `Ledger - m/44'/${coinType}'/${bip44HDPath.account}'${
                bip44HDPath.change !== 0 || bip44HDPath.addressIndex !== 0
                  ? `/${bip44HDPath.change}/${bip44HDPath.addressIndex}`
                  : ""
              }`;

              if (
                keyStore.meta &&
                keyStore.meta["__ledger__cosmos_app_like__"] &&
                keyStore.meta["__ledger__cosmos_app_like__"] !== "Cosmos"
              ) {
                paragraph += ` (${keyStore.meta["__ledger__cosmos_app_like__"]})`;
              }
            }

            console.log("paragraph", paragraph);

            const nameByChain = keyStore.meta?.["nameByChain"]
              ? JSON.parse(keyStore.meta["nameByChain"])
              : {};

            const accountName =
              nameByChain?.[chainId] ||
              keyStore.meta?.["name"] ||
              intl.formatMessage({
                id: "setting.keyring.unnamed-account",
              });
            const isCardanoNetwork =
              chainStore.current.chainId === "cardano-preview" ||
              chainStore.current.chainId === "cardano-preprod" ||
              chainStore.current.chainId === "cardano-mainnet";
            const walletId = keyStore.meta?.["__id__"] || "";
            const hasAddressForWallet = Boolean(addressesById[walletId]);
            const isClickable =
              !keyStore.selected && (!isCardanoNetwork || hasAddressForWallet);

            return (
              <Card
                key={keyStore.meta?.["__id__"] || i}
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
                rightContent={
                  keyStore.selected ? (
                    <div style={{ display: "flex", columnGap: "12px" }}>
                      <img
                        style={{
                          width: "16px",
                          height: "16px",
                        }}
                        src={require("@assets/svg/wireframe/check.svg")}
                        alt=""
                      />
                      <img
                        style={{
                          width: "16px",
                          height: "16px",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          setIsSelectWalletOpen?.(false);
                          setIsOptionsOpen?.(true);
                        }}
                        src={require("@assets/svg/edit-icon.svg")}
                        alt=""
                      />
                    </div>
                  ) : (
                    ""
                  )
                }
                subheading={(() => {
                  if (keyStore.selected) {
                    const isEvm =
                      chainStore.current.features?.includes("evm") ?? false;
                    const addr = isEvm
                      ? (accountInfo as any).ethereumHexAddress ||
                        accountInfo.bech32Address
                      : accountInfo.bech32Address;
                    return formatAddress(addr);
                  }

                  if (addressesById[walletId]) {
                    return formatAddress(addressesById[walletId]);
                  }

                  const isCardanoNetwork =
                    chainStore.current.chainId === "cardano-preview" ||
                    chainStore.current.chainId === "cardano-preprod" ||
                    chainStore.current.chainId === "cardano-mainnet";

                  if (isLoadingAddresses) {
                    return <Skeleton height="14px" width="120px" />;
                  }

                  // On Cardano, empty address means unsupported for that wallet
                  if (isCardanoNetwork) {
                    return "Not supported on Cardano";
                  }

                  return "";
                })()}
                style={{
                  padding: keyStore.selected ? "18px 18px" : "18px 16px",
                  cursor: isClickable ? undefined : "default",
                  opacity:
                    isCardanoNetwork && !hasAddressForWallet ? 0.6 : undefined,
                }}
                isActive={keyStore.selected}
                onClick={
                  keyStore.selected || !isClickable
                    ? undefined
                    : async (e: any) => {
                        e.preventDefault();
                        loadingIndicator.setIsLoading("keyring", true);
                        try {
                          await keyRingStore.changeKeyRing(i);
                          analyticsStore.logEvent("change_wallet_click");

                          // Check if current chain is Cardano and new wallet doesn't support it
                          const isCardanoSupportedWallet =
                            keyStore.type === "mnemonic" &&
                            keyStore.meta?.["mnemonicLength"] === "24";
                          const isCurrentChainCardano =
                            chainStore.current.chainId === "cardano-preview" ||
                            chainStore.current.chainId === "cardano-mainnet" ||
                            chainStore.current.chainId === "cardano-preprod";

                          // Switch to fetchhub if current chain is Cardano but new wallet doesn't support it
                          if (
                            isCurrentChainCardano &&
                            !isCardanoSupportedWallet
                          ) {
                            chainStore.selectChain(CHAIN_ID_FETCHHUB);
                            chainStore.saveLastViewChainId();
                          }
                          loadingIndicator.setIsLoading("keyring", false);
                          chatStore.userDetailsStore.resetUser();
                          proposalStore.resetProposals();
                          chatStore.messagesStore.resetChatList();
                          chatStore.messagesStore.setIsChatSubscriptionActive(
                            false
                          );
                          messageAndGroupListenerUnsubscribe();
                          navigate(navigateTo);
                          onItemSelect?.();
                        } catch (e: any) {
                          console.warn(
                            `Failed to change keyring: ${e.message}`
                          );
                          loadingIndicator.setIsLoading("keyring", false);
                        }
                      }
                }
              />
            );
          }
        )}
      </div>
    );
  }
);
