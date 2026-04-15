import React, { FunctionComponent } from "react";

import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";

import { useLoadingIndicator } from "@components/loading-indicator";
import { messageAndGroupListenerUnsubscribe } from "@graphQL/messages-api";
import { Card } from "@components-v2/card";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { useNotification } from "@components/notification";
import { formatAddress } from "@utils/format";
import style from "./style.module.scss";
import {
  ensureChainCompatibleBeforeSelectKeyStore,
  isCardanoChain,
  requestKeyringSurfacesSyncBroadcast,
  walletSupportsCardano,
} from "../../utils";
import { MultiKeyStoreInfoWithSelectedElem } from "@keplr-wallet/background";
import { Skeleton } from "@components-v2/skeleton-loader";
import {
  resolveWalletPickerItemState,
  walletPickerRowIsClickable,
} from "@utils/resolve-wallet-picker-item-state";
import { useWalletPickerAddressSync } from "./use-wallet-picker-address-sync";

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
    const notification = useNotification();
    const {
      chainStore,
      keyRingStore,
      analyticsStore,
      chatStore,
      proposalStore,
    } = useStore();

    const chainId = chainStore.current.chainId;
    const loadingIndicator = useLoadingIndicator();

    const { addressesById, isLoadingAddresses } = useWalletPickerAddressSync({
      chainStore,
      keyRingStore,
      notification,
    });

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
            const nameByChain = keyStore.meta?.["nameByChain"]
              ? JSON.parse(keyStore.meta["nameByChain"])
              : {};

            const accountName =
              nameByChain?.[chainId] ||
              keyStore.meta?.["name"] ||
              intl.formatMessage({
                id: "setting.keyring.unnamed-account",
              });
            const isCardanoNetwork = isCardanoChain(chainStore.current);
            const isCardanoSupportedWallet = walletSupportsCardano(keyStore);
            const walletId = keyStore.meta?.["__id__"] || "";
            const walletBoundAddress = addressesById[walletId] || "";

            const pickerItemState = resolveWalletPickerItemState({
              isCardanoNetwork,
              isCardanoSupportedWallet,
              walletBoundAddress,
              isLoadingAddresses,
            });

            const isClickable = walletPickerRowIsClickable({
              isRowSelected: Boolean(keyStore.selected),
              isCardanoNetwork,
              isCardanoSupportedWallet,
              item: pickerItemState,
            });

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
                  switch (pickerItemState.kind) {
                    case "address":
                      return formatAddress(pickerItemState.address);
                    case "unsupported":
                      return pickerItemState.reason === "cardano_unsupported"
                        ? "Not supported on Cardano"
                        : "";
                    case "loading":
                      return <Skeleton height="14px" width="120px" />;
                    case "empty":
                      return "";
                  }
                })()}
                style={{
                  padding: keyStore.selected ? "18px 18px" : "18px 16px",
                  cursor: isClickable ? undefined : "default",
                  opacity:
                    isCardanoNetwork && !isCardanoSupportedWallet
                      ? 0.6
                      : undefined,
                }}
                isActive={keyStore.selected}
                onClick={
                  keyStore.selected || !isClickable
                    ? undefined
                    : async (e: any) => {
                        e.preventDefault();
                        loadingIndicator.setIsLoading("keyring", true);
                        try {
                          await ensureChainCompatibleBeforeSelectKeyStore(
                            chainStore,
                            keyStore
                          );
                          await keyRingStore.changeKeyRing(i);
                          analyticsStore.logEvent("change_wallet_click");

                          await requestKeyringSurfacesSyncBroadcast();
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
