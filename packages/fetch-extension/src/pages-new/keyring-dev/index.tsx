import React, { FunctionComponent, useState, useEffect, useRef } from "react";

import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";

import { useLoadingIndicator } from "@components/loading-indicator";
import { messageAndGroupListenerUnsubscribe } from "@graphQL/messages-api";
// import { MultiKeyStoreInfoWithSelectedElem } from "@keplr-wallet/background";
import { Card } from "@components-v2/card";
import { App, AppCoinType } from "@keplr-wallet/ledger-cosmos";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { formatAddress } from "@utils/format";
import style from "./style.module.scss";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { ListAccountsMsg, MultiKeyStoreInfoWithSelectedElem } from "@keplr-wallet/background";
import { Skeleton } from "@components-v2/skeleton-loader";

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

    const accountInfo = accountStore.getAccount(chainStore.current.chainId);
    const loadingIndicator = useLoadingIndicator();
    const [allWalletAddresses, setAllWalletAddresses] = useState<string[]>([]);
    const [isLoadingAddresses, setIsLoadingAddresses] = useState<boolean>(true);
    // Cache addresses per chain to avoid recomputing while staying on the same network
    const cachedAddressesRef = useRef<{ chainId: string; byName: Record<string, string> } | null>(null);

    const getAllWalletAddresses = async () => {
      setIsLoadingAddresses(true);
      try {
        const currentChainId = chainStore.current.chainId;

        if (cachedAddressesRef.current?.chainId === currentChainId) {
          const cached = cachedAddressesRef.current.byName;
          const names = keyRingStore.multiKeyStoreInfo.map(
            (ks) => ks.meta?.["name"] || "Unnamed Account"
          );
          const addressesFromCache = names.map((n) => cached[n] || "");
          if (addressesFromCache.some((a) => a)) {
            setAllWalletAddresses(addressesFromCache);
            setIsLoadingAddresses(false);
            return;
          }
        }

        try {
          const cacheKey = `addr_cache:${currentChainId}`;
          const cachedJson = localStorage.getItem(cacheKey);
          if (cachedJson) {
            const byName = JSON.parse(cachedJson) as Record<string, string>;
            const names = keyRingStore.multiKeyStoreInfo.map(
              (ks) => ks.meta?.["name"] || "Unnamed Account"
            );
            const addressesFromSession = names.map((n) => byName[n] || "");
            if (addressesFromSession.some((a) => a)) {
              setAllWalletAddresses(addressesFromSession);
              cachedAddressesRef.current = { chainId: currentChainId, byName };
              setIsLoadingAddresses(false);
              return;
            }
          }
        } catch {}

        const requester = new InExtensionMessageRequester();
        const msg = new ListAccountsMsg();
        const accounts = await requester.sendMessage(BACKGROUND_PORT, msg);

        const isEvm = chainStore.current.features?.includes("evm") ?? false;
        
        // Map strictly by index to avoid name-collision issues; backend preserves order
        const addresses = keyRingStore.multiKeyStoreInfo.map((_ks: MultiKeyStoreInfoWithSelectedElem, idx: number) => {
          const acc = accounts[idx];
          if (!acc) return "";
          return isEvm ? acc.EVMAddress : acc.bech32Address;
        });
        setAllWalletAddresses(addresses);

        const byName: Record<string, string> = {};
        keyRingStore.multiKeyStoreInfo.forEach((ks, idx) => {
          const name = ks.meta?.["name"] || "Unnamed Account";
          byName[name] = addresses[idx] || "";
        });
        cachedAddressesRef.current = { chainId: currentChainId, byName };
        try {
          const cacheKey = `addr_cache:${currentChainId}`;
          localStorage.setItem(cacheKey, JSON.stringify(byName));
        } catch {}
      } catch (error) {
        // Silently fallback to empty addresses
        setAllWalletAddresses([]);
      } finally {
        setIsLoadingAddresses(false);
      }
    };

    useEffect(() => {
      getAllWalletAddresses();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chainStore.current.chainId, keyRingStore.multiKeyStoreInfo.length]);

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
        {keyRingStore.multiKeyStoreInfo.map((keyStore: MultiKeyStoreInfoWithSelectedElem, i: number) => {
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
          console.log(paragraph);
          const isCardanoNetwork =
            chainStore.current.chainId === "cardano-preview" ||
            chainStore.current.chainId === "cardano-preprod" ||
            chainStore.current.chainId === "cardano-mainnet";
          const hasAddressForWallet = Boolean(allWalletAddresses[i]);
          const isClickable = !keyStore.selected && (!isCardanoNetwork || hasAddressForWallet);

          return (
            <Card
              key={i}
              heading={
                <React.Fragment>
                  {keyStore.meta?.["name"]
                    ? keyStore.meta["name"]
                    : intl.formatMessage({
                        id: "setting.keyring.unnamed-account",
                      })}
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
              subheading={
                (() => {
                  if (keyStore.selected) {
                    const isEvm = chainStore.current.features?.includes("evm") ?? false;
                    const addr = isEvm
                      ? (accountInfo as any).ethereumHexAddress || accountInfo.bech32Address
                      : accountInfo.bech32Address;
                    return formatAddress(addr);
                  }

                  if (isLoadingAddresses) {
                    return <Skeleton height="14px" width="120px" />;
                  }

                  const isCardanoNetwork =
                    chainStore.current.chainId === "cardano-preview" ||
                    chainStore.current.chainId === "cardano-preprod" ||
                    chainStore.current.chainId === "cardano-mainnet";

                  if (allWalletAddresses[i]) {
                    return formatAddress(allWalletAddresses[i]);
                  }

                  // On Cardano, empty address means unsupported for that wallet
                  if (isCardanoNetwork) {
                    return "Not supported on Cardano";
                  }

                  return "";
                })()
              }
              style={{
                padding: keyStore.selected ? "18px 18px" : "18px 16px",
                cursor: isClickable ? undefined : "default",
                opacity: isCardanoNetwork && !hasAddressForWallet ? 0.6 : undefined,
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
                        console.log(`Failed to change keyring: ${e.message}`);
                        loadingIndicator.setIsLoading("keyring", false);
                      }
                    }
              }
            />
          );
        })}
      </div>
    );
  }
);
