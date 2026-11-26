import React, { FunctionComponent, useEffect, useState } from "react";

import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";

import { useLoadingIndicator } from "@components/loading-indicator";
import { messageAndGroupListenerUnsubscribe } from "@graphQL/messages-api";
import { GetCosmosKeysForEachVaultSettledMsg } from "@keplr-wallet/background";
import { Card } from "@components-v2/card";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { isPureEvmChain } from "@utils/filters";
import { formatAddress } from "@utils/format";
import style from "./style.module.scss";
import { dispatchGlobalEventExceptSelf } from "@utils/global-events";
import { getKeyInfoSocial, isPrivateKeyType } from "@utils/index";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { Skeleton } from "@components-v2/skeleton-loader";

interface SetKeyRingProps {
  navigateTo?: any;
  onItemSelect?: () => void;
  setIsOptionsOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedWalletId?: React.Dispatch<React.SetStateAction<string>>;
  setIsSelectWalletOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SetKeyRingPage: FunctionComponent<SetKeyRingProps> = observer(
  ({
    navigateTo,
    onItemSelect,
    setIsOptionsOpen,
    setIsSelectWalletOpen,
    setSelectedWalletId,
  }) => {
    const intl = useIntl();
    const navigate = useNavigate();
    const {
      chainStore,
      keyRingStore,
      analyticsStore,
      chatStore,
      proposalStore,
    } = useStore();

    const chainId = chainStore.current.chainId;
    const loadingIndicator = useLoadingIndicator();
    const [addressByVaultId, setAddressByVaultId] = useState<
      Record<string, string>
    >({});

    const isEvm = isPureEvmChain(chainStore.current);

    useEffect(() => {
      const fetchAddresses = async () => {
        if (keyRingStore.keyInfos.length === 0) {
          setAddressByVaultId({});
          return;
        }

        const requester = new InExtensionMessageRequester();
        const msg = new GetCosmosKeysForEachVaultSettledMsg(
          chainId,
          keyRingStore.keyInfos.map((item) => item.id)
        );

        const settledResponse = await requester.sendMessage(
          BACKGROUND_PORT,
          msg
        );

        const next: Record<string, string> = {};
        for (const item of settledResponse) {
          if (item.status === "fulfilled" && item.value) {
            const address = isEvm
              ? item.value.ethereumHexAddress?.trim()
              : item.value.bech32Address?.trim();
            if (address) {
              next[item.value.vaultId] = address;
            }
          }
        }
        setAddressByVaultId(next);
      };

      fetchAddresses();
    }, [chainId, keyRingStore.keyInfos.length, isEvm]);

    const getOptionIcon = (keyStore: any) => {
      if (keyStore.type === "ledger") {
        return require("@assets/svg/wireframe/ledger-indicator.svg");
      }

      if (isPrivateKeyType(keyStore.type)) {
        const { email, socialType } = getKeyInfoSocial(keyStore);
        if (email && socialType === "apple") {
          return require("@assets/svg/wireframe/apple-logo.svg");
        }
        if (email && socialType === "google") {
          return require("@assets/svg/wireframe/google-logo.svg");
        }
      }
      return;
    };

    return (
      <div>
        {keyRingStore.keyInfos.map((keyStore, i) => {
          const keyRingMeta = keyStore.insensitive["keyRingMeta"] as any;

          const nameByChain = keyRingMeta?.nameByChain
            ? JSON.parse(keyRingMeta?.nameByChain)
            : {};

          const accountName =
            nameByChain?.[chainId] ||
            keyStore.name ||
            intl.formatMessage({
              id: "setting.keyring.unnamed-account",
            });

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
              rightContent={
                <div style={{ display: "flex", columnGap: "12px" }}>
                  {keyStore.isSelected ? (
                    <img
                      style={{
                        width: "16px",
                        height: "16px",
                      }}
                      src={require("@assets/svg/wireframe/check.svg")}
                      alt=""
                    />
                  ) : (
                    ""
                  )}
                  <img
                    style={{
                      width: "16px",
                      height: "16px",
                      cursor: "pointer",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSelectWalletOpen?.(false);
                      setIsOptionsOpen?.(true);
                      setSelectedWalletId?.(keyStore.id);
                    }}
                    src={require("@assets/svg/edit-icon.svg")}
                    alt=""
                  />
                </div>
              }
              subheading={
                addressByVaultId[keyStore.id] ? (
                  formatAddress(addressByVaultId[keyStore.id])
                ) : (
                  <Skeleton height="14px" width="100px" />
                )
              }
              style={{
                padding: "18px 18px",
              }}
              isActive={keyStore.isSelected}
              onClick={
                keyStore.isSelected
                  ? undefined
                  : async (e: any) => {
                      e.preventDefault();
                      loadingIndicator.setIsLoading("keyring", true);
                      try {
                        await keyRingStore.selectKeyRing(keyStore.id);
                        dispatchGlobalEventExceptSelf("keplr_keyring_changed");
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
