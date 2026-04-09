import { Address } from "@components/address";
import { useNotification } from "@components/notification";
import { ToolTip } from "@components/tooltip";
import { WalletError } from "@keplr-wallet/router";
import { WalletStatus } from "@keplr-wallet/stores";
import {
  formatAddress,
  separateNumericAndDenom,
  splitBech32,
} from "@utils/format";
import classnames from "classnames";
import React, { useCallback, useEffect, useState, useRef } from "react";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { Button } from "reactstrap";
import { useStore } from "../../../stores";
import { addressCacheStore } from "../../../utils/address-cache-store";
import { Balances } from "../balances";
import style from "../style.module.scss";
import { WalletConfig } from "@keplr-wallet/stores/build/chat/user-details";
import { observer } from "mobx-react-lite";
import { txType } from "./constants";
import { Skeleton } from "@components-v2/skeleton-loader";
import { fetchProposalNodes } from "../../activity/utils";
import { ResponsiveAddressView } from "./address-view";

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
    const bech32TailMeasureRef = useRef<HTMLDivElement>(null);
    const evmTailMeasureRef = useRef<HTMLDivElement>(null);

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
    const navigate = useNavigate();
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

    const intl = useIntl();
    const notification = useNotification();

    const isEvm = chainStore.current.features?.includes("evm") ?? false;
    const selectedWalletId =
      keyRingStore.multiKeyStoreInfo.find((ks) => ks.selected)?.meta?.[
        "__id__"
      ] || "";
    const cachedSelectedAddress =
      selectedWalletId && chainStore.current.chainId
        ? addressCacheStore.getCache(chainStore.current.chainId)[selectedWalletId] ||
          ""
        : "";
    const selectedKeyStore = keyRingStore.multiKeyStoreInfo.find((ks) => ks.selected);
    const displayAccountName = (() => {
      const meta = selectedKeyStore?.meta;
      if (!meta) return "";
      try {
        const nameByChain = meta["nameByChain"] ? JSON.parse(meta["nameByChain"]) : {};
        return (
          nameByChain?.[chainStore.current.chainId] ||
          meta["name"] ||
          intl.formatMessage({ id: "setting.keyring.unnamed-account" })
        );
      } catch {
        return (
          meta["name"] || intl.formatMessage({ id: "setting.keyring.unnamed-account" })
        );
      }
    })();
    const displayBech32Address =
      accountInfo.walletStatus === WalletStatus.Loaded
        ? accountInfo.bech32Address
        : cachedSelectedAddress;
    const displayEvmAddress =
      isEvm || accountInfo.hasEthereumHexAddress
        ? accountInfo.walletStatus === WalletStatus.Loaded
          ? accountInfo.ethereumHexAddress
          : cachedSelectedAddress || accountInfo.ethereumHexAddress
        : "";
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

    const queries = queriesStore.get(current.chainId);

    const rewards = queries.cosmos.queryRewards.getQueryBech32Address(
      accountInfo.bech32Address
    );

    const stakableReward = rewards.stakableReward;
    const rewardsBal = stakableReward.toString();

    const { numericPart: rewardsBalNumber } =
      separateNumericAndDenom(rewardsBal);

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
            className={classnames(style["wallet-detail-main"], {
              [style["wallet-detail-main--rejected"]]:
                accountInfo.walletStatus === WalletStatus.Rejected,
            })}
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
                  return displayAccountName ? displayAccountName : <Skeleton height="21px" />;
                }
              })()}
            </div>
            <div className={style["wallet-detail-body"]}>
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
                <React.Fragment>
                  {displayBech32Address ? (
                    <div
                      className={style["wallet-address-row"]}
                      onClick={() => copyAddress(displayBech32Address)}
                    >
                      <div className={style["wallet-address-content"]}>
                        <Address
                          maxCharacters={16}
                          lineBreakBeforePrefix={false}
                          tooltipAddress={displayBech32Address}
                          childrenClassName={
                            style["wallet-address-tooltip-trigger"]
                          }
                          childrenStyle={{ opacity: 1 }}
                        >
                          <div className={style["wallet-address-inline"]}>
                            <span className={style["wallet-address-prefix"]}>
                              {splitBech32(displayBech32Address).prefix}
                            </span>
                            <div className={style["wallet-address-text"]}>
                              <div
                                ref={bech32TailMeasureRef}
                                className={style["wallet-address-tail-measure"]}
                              >
                                <ResponsiveAddressView
                                  containerRef={bech32TailMeasureRef}
                                  address={splitBech32(displayBech32Address).rest}
                                />
                              </div>
                            </div>
                          </div>
                        </Address>
                      </div>
                      <div
                        className={style["wallet-address-copy-slot"]}
                        aria-hidden="true"
                      >
                        <img
                          src={require("@assets/svg/wireframe/copyGrey.svg")}
                          alt=""
                        />
                      </div>
                    </div>
                  ) : (
                    <Skeleton height="21px" />
                  )}
                </React.Fragment>
              )}
              {accountInfo.walletStatus !== WalletStatus.Rejected &&
                (isEvm || accountInfo.hasEthereumHexAddress) && (
                  <div
                    className={style["wallet-address-row"]}
                    onClick={() => copyAddress(accountInfo.ethereumHexAddress)}
                  >
                    <div className={style["wallet-address-content"]}>
                      <Address
                        isRaw={true}
                        placement="bottom-end"
                        tooltipAddress={displayEvmAddress}
                        childrenClassName={
                          style["wallet-address-tooltip-trigger"]
                        }
                        childrenStyle={{ opacity: 1 }}
                      >
                        <div className={style["wallet-address-inline"]}>
                          {displayEvmAddress ? (
                            displayEvmAddress.length === 42 ? (
                              <React.Fragment>
                                <span className={style["wallet-address-prefix"]}>
                                  {displayEvmAddress.slice(0, 2)}
                                </span>
                                <div className={style["wallet-address-text"]}>
                                  <div
                                    ref={evmTailMeasureRef}
                                    className={style["wallet-address-tail-measure"]}
                                  >
                                    <ResponsiveAddressView
                                      containerRef={evmTailMeasureRef}
                                      address={displayEvmAddress.slice(2)}
                                    />
                                  </div>
                                </div>
                              </React.Fragment>
                            ) : (
                              <React.Fragment>{displayEvmAddress}</React.Fragment>
                            )
                          ) : (
                            "..."
                          )}
                        </div>
                      </Address>
                    </div>
                    <div
                      className={style["wallet-address-copy-slot"]}
                      aria-hidden="true"
                    >
                      <img
                        src={require("@assets/svg/wireframe/copy.svg")}
                        alt=""
                      />
                    </div>
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

        {rewardsBalNumber > 0 && (
          <div
            className={style["rewards-card"]}
            onClick={() => {
              analyticsStore.logEvent("claim_all_staking_reward_click", {
                pageName: "Home",
              });
              navigate("/stake");
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
              }}
            >
              <img src={require("@assets/svg/wireframe/stake.svg")} />
              <div>You’ve claimable staking rewards </div>
            </div>

            <i key="next" className="fas fa-chevron-right" />
          </div>
        )}

        <Balances tokenState={tokenState} />
      </div>
    );
  }
);
