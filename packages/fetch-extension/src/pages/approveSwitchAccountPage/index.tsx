import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import style from "./style.module.scss";
import { EmptyLayout } from "@layouts/empty-layout";
import { FormattedMessage } from "react-intl";
import { useInteractionInfo } from "@keplr-wallet/hooks";
import { observer } from "mobx-react-lite";
import classNames from "classnames";
import { useStore } from "../../stores";
import { messageAndGroupListenerUnsubscribe } from "@graphQL/messages-api";
import { useNotification } from "@components/notification";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { ListAccountsMsg } from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { ButtonV2 } from "@components-v2/buttons/button";
import { flowResult } from "mobx";
import {
  ensureChainCompatibleBeforeSelectKeyStore,
  requestKeyringSurfacesSyncBroadcast,
} from "../../utils";
import { rollbackLocalStateAfterFailedApproveSwitch } from "../../utils/approve-switch-rollback";

export const ApproveSwitchAccountByAddressPage: FunctionComponent = observer(
  () => {
    const {
      analyticsStore,
      chatStore,
      keyRingStore,
      accountSwitchStore,
      proposalStore,
      chainStore,
    } = useStore();

    const [isLoadingPlaceholder, setIsLoadingPlaceholder] = useState(true);
    const [addressIndex, setAddressIndex] = useState<number | undefined>(
      undefined
    );
    const [hasLoadError, setHasLoadError] = useState(false);
    const navigate = useNavigate();
    const notification = useNotification();
    const notificationRef = useRef(notification);
    notificationRef.current = notification;

    const interactionInfo = useInteractionInfo(() => {
      accountSwitchStore.rejectAll();
    });

    useEffect(() => {
      const abortController = new AbortController();
      const signal = abortController.signal;

      setHasLoadError(false);
      setAddressIndex(undefined);
      setIsLoadingPlaceholder(true);

      const findAndSetAddressIndex = async (abortSignal: AbortSignal) => {
        if (!accountSwitchStore.waitingSuggestedAccount) {
          return;
        }
        // TODO: update event properties then change chainId below
        const requester = new InExtensionMessageRequester();
        const msg = new ListAccountsMsg();
        const result = await requester.sendMessage(BACKGROUND_PORT, msg);

        if (abortSignal.aborted) {
          return;
        }

        if (result.error) {
          notificationRef.current.push({
            placement: "top-center",
            type: "danger",
            duration: 4,
            content: result.error,
            canDelete: true,
            transition: { duration: 0.25 },
          });
          setHasLoadError(true);
          setIsLoadingPlaceholder(false);
          return;
        }

        const { accounts } = result;
        const isEvm = chainStore.current.features?.includes("evm") ?? false;
        const addresses = accounts.map((account) => {
          if (isEvm) {
            return account.EVMAddress;
          }

          return account.bech32Address;
        });

        const index = addresses.findIndex((a) => {
          return (
            accountSwitchStore.waitingSuggestedAccount &&
            a === accountSwitchStore.waitingSuggestedAccount.data.address
          );
        });

        if (abortSignal.aborted) {
          return;
        }
        setAddressIndex(index);
        analyticsStore.logEvent("Account switch suggested", {
          chainId: chainStore.current.chainId,
        });
        setIsLoadingPlaceholder(false);
      };

      findAndSetAddressIndex(signal);

      return () => {
        abortController.abort();
      };
    }, [
      keyRingStore,
      chainStore,
      analyticsStore,
      accountSwitchStore,
      accountSwitchStore.waitingSuggestedAccount,
    ]);

    // useEffect(() => {
    //   setTimeout(() => {
    //     setIsLoadingPlaceholder(false);
    //   }, 1000);
    // }, []);

    if (!accountSwitchStore.waitingSuggestedAccount) {
      return null;
    }

    return (
      <EmptyLayout className={style["emptyLayout"]} style={{ height: "100%" }}>
        {isLoadingPlaceholder ? (
          <div className={style["container"]}>
            <div className={style["content"]}>
              <div className={style["logo"]}>
                <div className={style["imageContainer"]}>
                  <div
                    className={classNames(
                      style["skeleton"],
                      style["skeletonImageBackground"]
                    )}
                  />
                </div>
                <div className={style["dots"]}>
                  <div
                    className={classNames(
                      style["skeletonDot"],
                      style["skeleton"]
                    )}
                  />
                  <div
                    className={classNames(
                      style["skeletonDot"],
                      style["skeleton"]
                    )}
                  />
                  <div
                    className={classNames(
                      style["skeletonDot"],
                      style["skeleton"]
                    )}
                  />
                </div>
                <div className={style["imageContainer"]}>
                  <div
                    className={classNames(
                      style["skeleton"],
                      style["skeletonImageBackground"]
                    )}
                  />
                </div>
              </div>

              <h1 className={style["header"]}>Connecting...</h1>

              <div className={style["skeletonTag"]}>
                <div
                  className={classNames(
                    style["skeleton"],
                    style["skeletonGithubLink"]
                  )}
                />
              </div>

              <div className={classNames(style["skeletonParagraph"])}>
                <div
                  className={classNames(
                    style["skeleton"],
                    style["skeletonTitle"]
                  )}
                />
                <div
                  className={classNames(
                    style["skeleton"],
                    style["skeletonContent"]
                  )}
                />
              </div>

              <div className={style["buttons"]}>
                <div
                  className={classNames(
                    style["button"],
                    style["skeleton"],
                    style["skeletonButton"]
                  )}
                />
                <div
                  className={classNames(
                    style["button"],
                    style["skeleton"],
                    style["skeletonButton"]
                  )}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className={style["container"]}>
            {
              <div className={style["content"]}>
                <div className={style["logo"]}>
                  <div className={style["imageContainer"]}>
                    <div className={style["imageBackground"]} />
                    <img
                      className={style["logoImage"]}
                      src={require("@assets/png/White-black-circle.png")}
                      alt="chain logo"
                    />
                  </div>
                  <div className={style["dots"]}>
                    <div className={style["dot"]} />
                    <div className={style["dot"]} />
                    <div className={style["dot"]} />
                  </div>
                  <div className={style["imageContainer"]}>
                    <div className={style["imageBackground"]} />
                    <img
                      className={style["logoImage"]}
                      src={require("@assets/png/White-black-circle.png")}
                      alt="keplr logo"
                    />
                  </div>
                </div>
                <h1 className={style["header"]}>
                  <FormattedMessage
                    id="account.switch.title"
                    values={{
                      address:
                        accountSwitchStore.waitingSuggestedAccount?.data
                          .address,
                    }}
                  />
                </h1>

                <div className={style["paragraph"]}>
                  <FormattedMessage
                    id="account.switch.paragraph"
                    values={{
                      host: accountSwitchStore.waitingSuggestedAccount?.data
                        .origin,
                      address:
                        accountSwitchStore.waitingSuggestedAccount?.data
                          .address,
                      // eslint-disable-next-line react/display-name
                      b: (...chunks: any) => <b>{chunks}</b>,
                    }}
                  />
                </div>

                {addressIndex === -1 && (
                  <p>
                    Provided addresses not found in keyring. Nothing to Approve,
                    reject to close this window
                  </p>
                )}
              </div>
            }
            <div className={style["buttons"]}>
              <ButtonV2
                styleProps={{
                  padding: "10px",
                  height: "40px",
                  fontSize: "0.9rem",
                }}
                disabled={!accountSwitchStore.waitingSuggestedAccount}
                dataLoading={accountSwitchStore.isLoading}
                onClick={async (e: any) => {
                  e.preventDefault();

                  await accountSwitchStore.reject();

                  if (
                    interactionInfo.interaction &&
                    !interactionInfo.interactionInternal
                  ) {
                    window.close();
                  } else {
                    navigate("/");
                  }
                }}
                text={<FormattedMessage id="chain.suggested.button.reject" />}
              />
              <ButtonV2
                variant="dark"
                styleProps={{
                  padding: "10px",
                  height: "40px",
                  fontSize: "0.9rem",
                }}
                disabled={
                  !accountSwitchStore.waitingSuggestedAccount ||
                  hasLoadError ||
                  addressIndex === -1
                }
                dataLoading={accountSwitchStore.isLoading}
                onClick={async (e: any) => {
                  e.preventDefault();

                  const targetAddress =
                    accountSwitchStore.waitingSuggestedAccount?.data.address;
                  if (
                    targetAddress === undefined ||
                    addressIndex === undefined ||
                    addressIndex < 0 ||
                    hasLoadError
                  ) {
                    return;
                  }

                  const previousChainId = chainStore.selectedChainId;

                  try {
                    await flowResult(keyRingStore.refreshMultiKeyStoreInfo());

                    const requester = new InExtensionMessageRequester();
                    const listResult = await requester.sendMessage(
                      BACKGROUND_PORT,
                      new ListAccountsMsg()
                    );

                    if (listResult.error) {
                      notification.push({
                        placement: "top-center",
                        type: "danger",
                        duration: 4,
                        content: listResult.error,
                        canDelete: true,
                        transition: { duration: 0.25 },
                      });
                      return;
                    }

                    const isEvm =
                      chainStore.current.features?.includes("evm") ?? false;
                    const addresses = listResult.accounts.map((account) => {
                      if (isEvm) {
                        return account.EVMAddress;
                      }
                      return account.bech32Address;
                    });

                    const resolvedIndex = addresses.findIndex(
                      (a) => a === targetAddress
                    );
                    if (resolvedIndex < 0) {
                      notification.push({
                        placement: "top-center",
                        type: "danger",
                        duration: 4,
                        content:
                          "This address is no longer in the wallet list. Reject and try again.",
                        canDelete: true,
                        transition: { duration: 0.25 },
                      });
                      return;
                    }

                    if (resolvedIndex >= keyRingStore.multiKeyStoreInfo.length) {
                      notification.push({
                        placement: "top-center",
                        type: "danger",
                        duration: 4,
                        content:
                          "Wallet list out of sync. Reject and try again.",
                        canDelete: true,
                        transition: { duration: 0.25 },
                      });
                      return;
                    }

                    const targetKeyStore =
                      keyRingStore.multiKeyStoreInfo[resolvedIndex];
                    if (addresses[resolvedIndex] !== targetAddress) {
                      return;
                    }

                    const previousWalletId = String(
                      keyRingStore.multiKeyStoreInfo.find((k) => k.selected)
                        ?.meta?.["__id__"] ?? ""
                    );
                    const previousKeyRingIndex =
                      keyRingStore.multiKeyStoreInfo.findIndex(
                        (k) => k.selected
                      );

                    try {
                      await ensureChainCompatibleBeforeSelectKeyStore(
                        chainStore,
                        targetKeyStore
                      );
                    } catch (alignErr) {
                      console.error(
                        "[ApproveSwitchAccount] chain compatibility failed:",
                        alignErr
                      );
                      notification.push({
                        placement: "top-center",
                        type: "danger",
                        duration: 4,
                        content:
                          alignErr instanceof Error
                            ? alignErr.message
                            : String(alignErr),
                        canDelete: true,
                        transition: { duration: 0.25 },
                      });
                      return;
                    }

                    const chainMovedForCompatibility =
                      chainStore.selectedChainId !== previousChainId;

                    try {
                      await flowResult(
                        keyRingStore.changeKeyRing(resolvedIndex)
                      );
                    } catch (keyRingErr) {
                      if (chainMovedForCompatibility) {
                        try {
                          await flowResult(
                            chainStore.selectChainAndPersist(previousChainId)
                          );
                        } catch (rbErr) {
                          console.error(
                            "[ApproveSwitchAccount] chain rollback after changeKeyRing failure:",
                            rbErr
                          );
                        }
                      }
                      console.error(
                        "[ApproveSwitchAccount] changeKeyRing failed:",
                        keyRingErr
                      );
                      notification.push({
                        placement: "top-center",
                        type: "danger",
                        duration: 4,
                        content:
                          keyRingErr instanceof Error
                            ? keyRingErr.message
                            : String(keyRingErr),
                        canDelete: true,
                        transition: { duration: 0.25 },
                      });
                      return;
                    }

                    await requestKeyringSurfacesSyncBroadcast();

                    analyticsStore.logEvent("change_wallet_click");
                    chatStore.userDetailsStore.resetUser();
                    proposalStore.resetProposals();
                    chatStore.messagesStore.resetChatList();
                    chatStore.messagesStore.setIsChatSubscriptionActive(false);
                    messageAndGroupListenerUnsubscribe();

                    try {
                      await flowResult(
                        accountSwitchStore.approve(targetAddress)
                      );
                    } catch (approveErr) {
                      console.error(
                        "[ApproveSwitchAccount] approve failed:",
                        approveErr
                      );
                      const approveMessage =
                        approveErr instanceof Error
                          ? approveErr.message
                          : String(approveErr);
                      try {
                        await rollbackLocalStateAfterFailedApproveSwitch({
                          multiKeyStoreInfo: keyRingStore.multiKeyStoreInfo,
                          previousWalletId,
                          previousKeyRingIndex,
                          previousChainId,
                          getSelectedChainId: () => chainStore.selectedChainId,
                          changeKeyRing: (i) => keyRingStore.changeKeyRing(i),
                          selectChainAndPersist: (id) =>
                            chainStore.selectChainAndPersist(id),
                        });
                        notification.push({
                          placement: "top-center",
                          type: "danger",
                          duration: 6,
                          content: `${approveMessage} Your wallet and network were restored because the dApp did not receive approval.`,
                          canDelete: true,
                          transition: { duration: 0.25 },
                        });
                      } catch (rollbackErr) {
                        console.error(
                          "[ApproveSwitchAccount] rollback after failed approve:",
                          rollbackErr
                        );
                        notification.push({
                          placement: "top-center",
                          type: "danger",
                          duration: 8,
                          content:
                            "Account switch failed and automatic rollback failed. The extension may not match the dApp — disconnect and try again.",
                          canDelete: true,
                          transition: { duration: 0.25 },
                        });
                      }
                      return;
                    }

                    if (
                      interactionInfo.interaction &&
                      !interactionInfo.interactionInternal
                    ) {
                      window.close();
                    } else {
                      navigate("/");
                    }
                  } catch (error) {
                    console.error(
                      "[ApproveSwitchAccount] switch flow failed:",
                      error
                    );
                    notification.push({
                      placement: "top-center",
                      type: "danger",
                      duration: 4,
                      content:
                        error instanceof Error ? error.message : String(error),
                      canDelete: true,
                      transition: { duration: 0.25 },
                    });
                  }
                }}
                text={<FormattedMessage id="chain.suggested.button.approve" />}
              />
            </div>
          </div>
        )}
      </EmptyLayout>
    );
  }
);
