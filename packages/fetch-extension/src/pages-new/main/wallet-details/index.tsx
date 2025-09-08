import { Skeleton } from "@components-v2/skeleton-loader";
import { Address } from "@components/address";
import { useNotification } from "@components/notification";
import { ToolTip } from "@components/tooltip";
import { WalletError } from "@keplr-wallet/router";
import { WalletStatus } from "@keplr-wallet/stores";
import { WalletConfig } from "@keplr-wallet/stores/build/chat/user-details";
import {
  formatAddress,
  formatAddressWithCustom,
  splitBech32,
} from "@utils/format";
import { observer } from "mobx-react-lite";
import React, { useCallback, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { Button } from "reactstrap";
import { useStore } from "../../../stores";
import { fetchProposalNodes } from "../../activity/utils";
import { Balances } from "../balances";
import style from "../style.module.scss";
import { txType } from "./constants";

export const WalletDetailsView = observer(
  ({
    setIsSelectNetOpen,
    setIsSelectWalletOpen,
    tokenState,
  }: {
    setIsSelectNetOpen: any;
    setIsSelectWalletOpen?: any;
    tokenState: any;
  }) => {
    const {
      keyRingStore,
      chatStore,
      accountStore,
      chainStore,
      queriesStore,
      uiConfigStore,
      activityStore,
      analyticsStore,
    } = useStore();
    const userState = chatStore.userDetailsStore;

    const { hasFET, enabledChainIds } = userState;
    const config: WalletConfig = userState.walletConfig;
    const current = chainStore.current;
    const [chatTooltip, setChatTooltip] = useState("");
    const [chatDisabled, setChatDisabled] = useState(false);

    const [currentTxnType, setCurrentTxnType] = useState<string>("");

    useEffect(() => {
      if (keyRingStore.keyRingType === "ledger") {
        setChatTooltip("Coming soon for ledger");
        setChatDisabled(true);
        return;
      }

      if (config.requiredNative && !hasFET) {
        setChatTooltip("You need to have FET balance to use this feature");
        setChatDisabled(true);
        return;
      } else {
        setChatTooltip("");
        setChatDisabled(false);
      }

      if (!enabledChainIds.includes(current.chainId)) {
        setChatDisabled(true);
        setChatTooltip("Feature not available on this network");
        return;
      }

      if (!chatDisabled && chatTooltip === "") {
        setChatDisabled(true);
        setChatTooltip("Feature coming soon.");
      }
    }, [
      hasFET,
      enabledChainIds,
      config.requiredNative,
      keyRingStore.keyRingType,
      current.chainId,
    ]);
    const accountInfo = accountStore.getAccount(chainStore.current.chainId);

    const icnsPrimaryName = (() => {
      if (
        uiConfigStore.icnsInfo &&
        chainStore.hasChain(uiConfigStore.icnsInfo.chainId)
      ) {
        const queries = queriesStore.get(uiConfigStore.icnsInfo.chainId);
        const icnsQuery = queries.icns.queryICNSNames.getQueryContract(
          uiConfigStore.icnsInfo.resolverContractAddress,
          accountStore.getAccount(chainStore.current.chainId).bech32Address
        );

        return icnsQuery.primaryName;
      }
    })();

    const isEvm = chainStore.current.features?.includes("evm") ?? false;

    const intl = useIntl();
    const notification = useNotification();
    const copyAddress = useCallback(
      async (address: string) => {
        if (accountInfo.walletStatus === WalletStatus.Loaded) {
          await navigator.clipboard.writeText(address);
          notification.push({
            placement: "top-center",
            type: "success",
            duration: 2,
            content: intl.formatMessage({
              id: "main.address.copied",
            }),
            canDelete: true,
            transition: {
              duration: 0.25,
            },
          });
        }
      },
      [accountInfo.walletStatus, notification, intl]
    );

    const accountOrChainChanged =
      activityStore.getAddress !== accountInfo.bech32Address ||
      activityStore.getChainId !== current.chainId;

    useEffect(() => {
      /*  this is required because accountInit sets the nodes on reload, 
          so we wait for accountInit to set the proposal nodes and then we 
          store the proposal votes from api in activity store */
      if (!isEvm) {
        const timeout = setTimeout(async () => {
          const nodes = activityStore.sortedNodesProposals;
          if (nodes.length === 0) {
            const nodes = await fetchProposalNodes(
              "",
              current.chainId,
              accountInfo.bech32Address
            );
            if (nodes.length) {
              nodes.forEach((node: any) => activityStore.addProposalNode(node));
            }
          }
        }, 100);

        return () => {
          clearTimeout(timeout);
        };
      }
    }, [
      accountInfo.bech32Address,
      current.chainId,
      accountOrChainChanged,
      activityStore,
      isEvm,
    ]);

    useEffect(() => {
      if (accountOrChainChanged) {
        activityStore.setAddress(accountInfo.bech32Address);
        activityStore.setChainId(current.chainId);
      }
      if (accountInfo.bech32Address !== "" && !isEvm) {
        activityStore.accountInit();
      }
    }, [
      accountInfo.bech32Address,
      current.chainId,
      accountOrChainChanged,
      activityStore,
      isEvm,
    ]);

    useEffect(() => {
      if (Object.values(activityStore.getPendingTxn).length > 0) {
        const txns: any = Object.values(activityStore.getPendingTxn);
        setCurrentTxnType(txns[0].type);
      }
    }, [activityStore.getPendingTxn]);

    return (
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            fontWeight: 400,
          }}
        >
          <button
            onClick={() => {
              setIsSelectNetOpen(true);
            }}
            className={style["chain-select"]}
          >
            {formatAddress(current.chainName)}
            <img
              src={require("@assets/svg/wireframe/chevron-down.svg")}
              alt=""
            />
          </button>

          {/* Chat disabled */}
          {/* <button
            disabled={chatDisabled}
            onClick={() => {
              navigate("/chat");
            }}
            className={style["chat-button"]}
          >
            <img
              id="chat-img"
              src={require("@assets/svg/wireframe/chat-alt.svg")}
              alt=""
            />
            {chatDisabled && (
              <UncontrolledTooltip placement="top" target={"chat-img"}>
                {chatTooltip}
              </UncontrolledTooltip>
            )}
          </button> */}
        </div>
        <div className={style["wallet-detail-card"]}>
          <div
            style={
              accountInfo.walletStatus === WalletStatus.Rejected
                ? { display: "flex", gap: "10px", alignItems: "center" }
                : {
                    display: "flex",
                    columnGap: "10px",
                    flexDirection: "column",
                    width: "80%",
                  }
            }
          >
            <div className={style["wallet-address"]}>
              {(() => {
                if (accountInfo.walletStatus === WalletStatus.Loaded) {
                  if (icnsPrimaryName) {
                    return icnsPrimaryName;
                  }

                  if (accountInfo.name) {
                    return accountInfo.name;
                  }
                  return intl.formatMessage({
                    id: "setting.keyring.unnamed-account",
                  });
                } else if (accountInfo.walletStatus === WalletStatus.Rejected) {
                  return "Unable to Load Key";
                } else {
                  return <Skeleton height="21px" />;
                }
              })()}
            </div>
            <div style={{ width: "85%" }}>
              <div className={style["walletRejected"]}>
                {accountInfo.walletStatus === WalletStatus.Rejected && (
                  <ToolTip
                    tooltip={(() => {
                      if (
                        accountInfo.rejectionReason &&
                        accountInfo.rejectionReason instanceof WalletError &&
                        accountInfo.rejectionReason.module === "keyring" &&
                        accountInfo.rejectionReason.code === 152
                      ) {
                        // Return unsupported device message
                        return "Ledger is not supported for this chain";
                      }

                      let result = "Failed to load account by unknown reason";
                      if (accountInfo.rejectionReason) {
                        result += `: ${accountInfo.rejectionReason.toString()}`;
                      }

                      return result;
                    })()}
                    theme="dark"
                    trigger="hover"
                    options={{
                      placement: "top",
                    }}
                  >
                    <i
                      className={`fas fa-exclamation-triangle text-danger ${style["unsupportedKeyIcon"]}`}
                    />
                  </ToolTip>
                )}
              </div>
              {accountInfo.walletStatus !== WalletStatus.Rejected && !isEvm && (
                <div>
                  {accountInfo.walletStatus === WalletStatus.Loaded &&
                  accountInfo.bech32Address ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        cursor: "pointer",
                        fontWeight: 400,
                      }}
                      onClick={() => copyAddress(accountInfo.bech32Address)}
                    >
                      <Address
                        maxCharacters={16}
                        tooltipFontSize="12px"
                        lineBreakBeforePrefix={false}
                        tooltipAddress={accountInfo.bech32Address}
                      >
                        <span style={{ display: "flex" }}>
                          {splitBech32(accountInfo.bech32Address).prefix}
                          <span className={style["wallet-address-text"]}>
                            {formatAddressWithCustom(
                              splitBech32(accountInfo.bech32Address).rest,
                              3,
                              6
                            )}
                          </span>
                        </span>
                      </Address>
                      <img
                        style={{ cursor: "pointer" }}
                        src={require("@assets/svg/wireframe/copyGrey.svg")}
                        alt=""
                      />
                    </div>
                  ) : (
                    <Skeleton height="21px" />
                  )}
                </div>
              )}
              {accountInfo.walletStatus !== WalletStatus.Rejected &&
                (isEvm || accountInfo.hasEthereumHexAddress) && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <div
                      onClick={() =>
                        copyAddress(accountInfo.ethereumHexAddress)
                      }
                    >
                      <Address
                        isRaw={true}
                        tooltipFontSize="12px"
                        tooltipAddress={accountInfo.ethereumHexAddress}
                      >
                        <span className={style["wallet-address-text-eth"]}>
                          {accountInfo.walletStatus === WalletStatus.Loaded &&
                          accountInfo.ethereumHexAddress
                            ? accountInfo.ethereumHexAddress.length === 42
                              ? `${accountInfo.ethereumHexAddress.slice(
                                  0,
                                  6
                                )}...${accountInfo.ethereumHexAddress.slice(
                                  -6
                                )}`
                              : accountInfo.ethereumHexAddress
                            : "..."}
                        </span>
                      </Address>
                    </div>
                    <img
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        copyAddress(accountInfo.ethereumHexAddress)
                      }
                      src={require("@assets/svg/wireframe/copy.svg")}
                      alt=""
                    />
                  </div>
                )}
            </div>
          </div>
          <Button
            onClick={() => {
              setIsSelectWalletOpen(true);
              analyticsStore.logEvent("change_wallet_click", {
                pageName: "Home",
              });
              // analyticsStore.logEvent("account_icon_click", {
              //   pageName: "Home",
              // });
            }}
            className={style["change-net"]}
          >
            <img
              style={{ width: "14px", height: "16px" }}
              src={require("@assets/svg/wireframe/chevron-down.svg")}
              alt=""
            />
          </Button>
        </div>
        {icnsPrimaryName ? (
          <div style={{ display: "flex", alignItems: "center", height: "1px" }}>
            <img
              style={{
                width: "24px",
                height: "24px",
                marginLeft: "2px",
              }}
              src={require("../../../public/assets/img/icns-mark.png")}
              alt="icns-registered"
            />
          </div>
        ) : null}

        {Object.values(activityStore.getPendingTxn).length > 0 && (
          <div
            className={style["wallet-detail-card"]}
            style={{
              marginTop: "12px",
              gap: "2px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
              }}
            >
              <i className="fas fa-spinner fa-spin ml-2 mr-2" />
              {Object.values(activityStore.getPendingTxn).length > 1 ? (
                <div>
                  {Object.values(activityStore.getPendingTxn).length}{" "}
                  transactions in progress
                </div>
              ) : (
                <div>{txType[currentTxnType]} in progress</div>
              )}
            </div>
          </div>
        )}
        <Balances tokenState={tokenState} />
      </div>
    );
  }
);
