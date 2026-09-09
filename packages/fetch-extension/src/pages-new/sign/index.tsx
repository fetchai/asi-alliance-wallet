import React, {
  FunctionComponent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import style from "./style.module.scss";

import { useStore } from "../../stores";

import { DataTab } from "./data-tab";
import { DetailsTab } from "./details-tab";
import { FormattedMessage } from "react-intl";

import { useNavigate } from "react-router";
import { observer } from "mobx-react-lite";
import {
  useFeeConfig,
  useInteractionInfo,
  useMemoConfig,
  useSignDocAmountConfig,
  useSignDocHelper,
  useZeroAllowedGasConfig,
} from "@keplr-wallet/hooks";
import { ADR36SignDocDetailsTab } from "./adr-36";
import { unescapeHTML } from "@keplr-wallet/common";
import { EthSignType } from "@keplr-wallet/types";
import { flowResult } from "mobx";
import { Dropdown } from "@components-v2/dropdown";
import { TabsPanel } from "@components-v2/tabs/tabsPanel-2";
import { ButtonV2 } from "@components-v2/buttons/button";
import {
  ClearSignSwitchTicketMsg,
  GetSelectedChainIdMsg,
  GetSignSwitchTicketValidMsg,
  GetSidePanelEnabledMsg,
  GetSidePanelIsSupportedMsg,
  IssueSignSwitchTicketMsg,
  LedgerApp,
} from "@keplr-wallet/background";
import { LedgerBox, LedgerGuideBoxProps } from "./ledger-guide-box";
import { useUSBDevices } from "@utils/ledger";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT, WalletError } from "@keplr-wallet/router";
import {
  ErrFailedInit,
  ErrFailedUnknown,
} from "@keplr-wallet/background/src/ledger/types";
import { ErrModuleLedgerSign } from "@keplr-wallet/background/build/ledger/types";
import {
  RequestedChainProvider,
  type RequestedChainContextValue,
} from "../../utils/requested-chain-context";
import {
  assertSignApproveStillValid,
  prepareSignRequest,
  requiresCardanoLiveNetworkSwitch,
  type PrepareSignRequestFailure,
} from "./prepare-sign-request";
import { isNetworkSurfacesSyncMessage } from "../../utils/network-surfaces-sync";
import {
  nextGateCacheEpoch,
  resolveAuthorityChainIdWithEpochRetry,
  resolvePreApproveGateReads,
  resolveTicketValidWithEpochRetry,
} from "./sign-ticket-ui-cache";
import {
  queryTicketValidForApprove as queryTicketValidForApproveHelper,
  undoPersistAfterSupersede,
  clearTicketOnSignDismiss,
} from "./sign-switch-cta";

async function clearSignSwitchTicketBg(interactionId?: string): Promise<void> {
  try {
    await new InExtensionMessageRequester().sendMessage(
      BACKGROUND_PORT,
      new ClearSignSwitchTicketMsg(interactionId)
    );
  } catch {
    // Best-effort clear.
  }
}

/** BG NetworkAuthority selected chain — not UI projection. */
async function fetchBgAuthorityChainId(): Promise<string | undefined> {
  try {
    const { chainId } = await new InExtensionMessageRequester().sendMessage(
      BACKGROUND_PORT,
      new GetSelectedChainIdMsg()
    );
    return chainId || undefined;
  } catch {
    return undefined;
  }
}

function formatPrepareError(error: PrepareSignRequestFailure["error"]): string {
  switch (error.code) {
    case "no_waiting_data":
      return "No sign request";
    case "interaction_replaced":
      return "Sign request was replaced";
    case "chain_id_unmatched":
      return `Chain id unmatched: expected ${error.expected}, got ${error.actual}`;
    case "resolve_failed":
      return `Cannot resolve network for this request (${error.cause.code}): ${error.cause.requestedChainId}`;
    default:
      return "Invalid sign request";
  }
}

/**
 * Sign approval UI bound to a resolved request-scoped chain.
 * Must not call selectChainAndPersist on mount — only after explicit Cardano CTA.
 */
const SignRequestContent: FunctionComponent<{
  requested: RequestedChainContextValue;
  interactionId: string;
  waitingChainId: string;
  isADR36: boolean;
}> = observer(({ requested, interactionId, waitingChainId, isADR36 }) => {
  const navigate = useNavigate();

  const {
    chainStore,
    keyRingStore,
    signInteractionStore,
    accountStore,
    queriesStore,
    ledgerInitStore,
  } = useStore();

  const effectiveChainId = requested.chainInfo.chainId;
  const accountInfo = accountStore.getAccount(effectiveChainId);
  const [signer, setSigner] = useState("");
  const [origin, setOrigin] = useState<string | undefined>();
  const [isADR36WithString, setIsADR36WithString] = useState<
    boolean | undefined
  >();
  const [ethSignType, setEthSignType] = useState<EthSignType | undefined>();
  const [approveButtonClicked, setApproveButtonClicked] = useState(false);
  const { testUSBDevices } = useUSBDevices();
  const [ledgerInfo, setLedgerInfo] = useState<
    LedgerGuideBoxProps | undefined
  >();
  const [sidePanelEnabled, setSidePanelEnabled] = useState(false);
  const [docReady, setDocReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // BG sign-switch ticket: valid after CTA Select ACK until any later
  // authority revision bump. Gate does not use UI projection lag.
  const [switchTicketValid, setSwitchTicketValid] = useState(false);
  // Shared epoch for ticket + authority UI caches: invalidate bumps both
  // so in-flight GetSignSwitchTicketValid / GetSelectedChainIdMsg cannot write
  // stale match-arm values after concurrent Select.
  const gateCacheEpochRef = useRef(0);
  // Match arm of live Cardano gate: BG authority only (same source as mid-CTA
  // undo). Never chainStore.selectedChainId — projection can lag after Select.
  // Cleared to undefined on every gate invalidate (fail-closed until apply).
  const [authorityChainId, setAuthorityChainId] = useState<
    string | undefined
  >();

  // There are services that sometimes use invalid tx to sign arbitrary data on the sign page.
  // In this case, there is no obligation to deal with it, but 0 gas is favorably allowed.
  const gasConfig = useZeroAllowedGasConfig(chainStore, effectiveChainId, 0);
  const amountConfig = useSignDocAmountConfig(
    chainStore,
    accountStore,
    effectiveChainId,
    signer
  );
  const feeConfig = useFeeConfig(
    chainStore,
    queriesStore,
    effectiveChainId,
    signer,
    amountConfig,
    gasConfig
  );
  const memoConfig = useMemoConfig(chainStore, effectiveChainId);

  const signDocHelper = useSignDocHelper(feeConfig, memoConfig);
  amountConfig.setSignDocHelper(signDocHelper);

  const needsCardanoNetworkSwitch = requiresCardanoLiveNetworkSwitch({
    requestedChainId: effectiveChainId,
    authorityChainId,
    isADR36,
    switchTicketValid,
  });

  /** Fail-closed: ticket false + authority unknown until epoch-applied BG reads. */
  const invalidateGateCache = () => {
    gateCacheEpochRef.current = nextGateCacheEpoch(gateCacheEpochRef.current);
    setSwitchTicketValid(false);
    setAuthorityChainId(undefined);
  };

  const refreshAuthorityChainId = async (): Promise<string | undefined> => {
    const outcome = await resolveAuthorityChainIdWithEpochRetry({
      getEpoch: () => gateCacheEpochRef.current,
      queryChainId: fetchBgAuthorityChainId,
    });
    if (!outcome.applied) {
      return undefined;
    }
    setAuthorityChainId(outcome.chainId);
    return outcome.chainId;
  };

  /**
   * Refresh UI ticket cache from BG. Epoch-dropped answers are retried — never
   * treated as valid:false (drop ≠ BG invalid).
   */
  const refreshSwitchTicket = async (): Promise<boolean> => {
    const outcome = await resolveTicketValidWithEpochRetry({
      getEpoch: () => gateCacheEpochRef.current,
      queryValid: async () => {
        const { valid } = await new InExtensionMessageRequester().sendMessage(
          BACKGROUND_PORT,
          new GetSignSwitchTicketValidMsg(interactionId, effectiveChainId)
        );
        return valid;
      },
    });
    if (!outcome.applied) {
      // Exhausted retries under continuous invalidate — leave cache as-is
      // (typically false from the last invalidate) and fail closed for awaiters.
      return false;
    }
    setSwitchTicketValid(outcome.valid);
    return outcome.valid;
  };

  /**
   * Fresh BG ticket reads for approve (double-query). Does not invalidate —
   * caller must invalidateGateCache + refresh authority first, then call this
   * last so ticket SoT cannot race ahead of a post-Select authority read.
   */
  const queryTicketValidForApprove = (): Promise<boolean> =>
    queryTicketValidForApproveHelper(refreshSwitchTicket);

  const refreshGateFromBackground = () => {
    invalidateGateCache();
    void refreshAuthorityChainId();
    void refreshSwitchTicket();
  };

  // Keep UI ticket cache + authority match arm aligned with BG SoT.
  useEffect(() => {
    refreshGateFromBackground();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactionId, effectiveChainId, chainStore.selectedChainId]);

  useEffect(() => {
    const onMessage = (message: unknown) => {
      if (isNetworkSurfacesSyncMessage(message)) {
        refreshGateFromBackground();
      }
    };

    const onFocusOrVisible = () => {
      refreshGateFromBackground();
    };

    const detach: Array<() => void> = [];

    try {
      if (typeof browser !== "undefined" && browser.runtime?.onMessage) {
        browser.runtime.onMessage.addListener(onMessage);
        detach.push(() => browser.runtime.onMessage.removeListener(onMessage));
      }
    } catch {
      // Non-extension test environments.
    }

    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocusOrVisible);
      detach.push(() => window.removeEventListener("focus", onFocusOrVisible));
    }
    if (typeof document !== "undefined") {
      const onVis = () => {
        if (document.visibilityState === "visible") {
          onFocusOrVisible();
        }
      };
      document.addEventListener("visibilitychange", onVis);
      detach.push(() =>
        document.removeEventListener("visibilitychange", onVis)
      );
    }

    return () => {
      for (const d of detach) {
        d();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactionId, effectiveChainId]);

  // Drop BG ticket when this interaction's content unmounts (close / supersede).
  useEffect(() => {
    return () => {
      void clearTicketOnSignDismiss({
        clearTicket: () => clearSignSwitchTicketBg(interactionId),
        invalidateGateCache,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactionId]);

  useEffect(() => {
    const data = signInteractionStore.waitingData;
    if (!data || data.id !== interactionId) {
      setDocReady(false);
      return;
    }

    let cancelled = false;
    setDocReady(false);
    setInitError(null);

    try {
      const prepared = prepareSignRequest(chainStore, data, interactionId);
      if (!prepared.ok) {
        setInitError(formatPrepareError(prepared.error));
        return;
      }

      if (data.data.signDocWrapper.isADR36SignDoc) {
        setIsADR36WithString(data.data.isADR36WithString);
      }
      if (data.data.ethSignType) {
        setEthSignType(data.data.ethSignType);
      }
      setOrigin(data.data.msgOrigin);
      signDocHelper.setSignDocWrapper(data.data.signDocWrapper);
      gasConfig.setGas(data.data.signDocWrapper.gas);
      let memo = data.data.signDocWrapper.memo;
      if (data.data.signDocWrapper.mode === "amino") {
        memo = unescapeHTML(memo);
      }
      memoConfig.setMemo(memo);
      if (
        (!data.isInternal || data.data.signOptions.preferNoSetFee) &&
        data.data.signDocWrapper.fees[0]
      ) {
        feeConfig.setManualFee(data.data.signDocWrapper.fees[0]);
      }

      const disableBalanceForCardanoRuntime = needsCardanoNetworkSwitch;

      amountConfig.setDisableBalanceCheck(
        !!data.data.signOptions.disableBalanceCheck ||
          disableBalanceForCardanoRuntime
      );
      feeConfig.setDisableBalanceCheck(
        !!data.data.signOptions.disableBalanceCheck ||
          disableBalanceForCardanoRuntime
      );
      if (
        data.data.signDocWrapper.granter &&
        data.data.signDocWrapper.granter !== data.data.signer
      ) {
        feeConfig.setDisableBalanceCheck(true);
      }
      setSigner(data.data.signer);
      if (!cancelled) {
        setDocReady(true);
      }
    } catch (error) {
      if (!cancelled) {
        setInitError(error instanceof Error ? error.message : String(error));
        setDocReady(false);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [
    amountConfig,
    chainStore,
    feeConfig,
    gasConfig,
    interactionId,
    memoConfig,
    needsCardanoNetworkSwitch,
    signDocHelper,
    signInteractionStore.waitingData,
  ]);

  const [isProcessing, setIsProcessing] = useState(false);
  const needSetIsProcessing =
    signInteractionStore.waitingData?.data.signOptions.preferNoSetFee ===
      true ||
    signInteractionStore.waitingData?.data.signOptions.preferNoSetMemo === true;

  const preferNoSetFee =
    signInteractionStore.waitingData?.data.signOptions.preferNoSetFee ===
      true || isProcessing;
  const preferNoSetMemo =
    signInteractionStore.waitingData?.data.signOptions.preferNoSetMemo ===
      true || isProcessing;

  // Reject-on-unmount lives only on SignPageV2. Binding rejectAll here would
  // cancel a superseded request B when React remounts content keyed by A→B.
  const interactionInfo = useInteractionInfo(undefined, {
    enableScroll: true,
  });

  const isLoaded = docReady && !initError && !!signDocHelper.signDocWrapper;

  const approveIsDisabled = (() => {
    if (!isLoaded) {
      return true;
    }
    if (needsCardanoNetworkSwitch) {
      // Live Cardano (non-ADR-36) requires an explicit network switch first.
      return true;
    }
    if (!signDocHelper.signDocWrapper) {
      return true;
    }
    if (signDocHelper.signDocWrapper.isADR36SignDoc) {
      return false;
    }
    return memoConfig.error != null || feeConfig.error != null;
  })();

  const [isOpen, setIsOpen] = useState(true);
  const isADR36SignDoc =
    signDocHelper.signDocWrapper && signDocHelper.signDocWrapper.isADR36SignDoc;

  const tabs = [
    {
      id: "Details",
      component: isADR36SignDoc ? (
        <ADR36SignDocDetailsTab
          signDocWrapper={signDocHelper.signDocWrapper}
          isADR36WithString={isADR36WithString}
          ethSignType={ethSignType}
          origin={origin}
        />
      ) : (
        <DetailsTab
          signDocHelper={signDocHelper}
          memoConfig={memoConfig}
          feeConfig={feeConfig}
          gasConfig={gasConfig}
          isInternal={
            interactionInfo.interaction && interactionInfo.interactionInternal
          }
          preferNoSetFee={preferNoSetFee}
          preferNoSetMemo={preferNoSetMemo}
          isNeedLedgerEthBlindSigning={
            ethSignType === EthSignType.EIP712 &&
            accountStore.getAccount(effectiveChainId).isNanoLedger
          }
        />
      ),
    },
    {
      id: "Data",
      component: (
        <DataTab signDocHelper={signDocHelper} ethSignType={ethSignType} />
      ),
    },
  ];

  useEffect(() => {
    const msg = new GetSidePanelIsSupportedMsg();
    new InExtensionMessageRequester()
      .sendMessage(BACKGROUND_PORT, msg)
      .then((_) => {
        const msg = new GetSidePanelEnabledMsg();
        new InExtensionMessageRequester()
          .sendMessage(BACKGROUND_PORT, msg)
          .then((res) => {
            setSidePanelEnabled(res.enabled);
          });
      });
  }, []);

  function calculateHeight() {
    if (sidePanelEnabled) {
      return ledgerInfo ? "70%" : "80%";
    }

    return ledgerInfo
      ? ledgerInfo.ledgerError.code === ErrFailedInit
        ? "245px"
        : "265px"
      : "320px";
  }

  const onReject = async () => {
    if (needSetIsProcessing) {
      setIsProcessing(true);
    }
    await clearTicketOnSignDismiss({
      clearTicket: () => clearSignSwitchTicketBg(interactionId),
      invalidateGateCache,
    });
    await signInteractionStore.rejectAll();
    if (interactionInfo.interaction && !interactionInfo.interactionInternal) {
      window.close();
    } else {
      navigate("/");
    }
  };

  const onSwitchNetwork = async () => {
    setSwitchingNetwork(true);
    setSwitchError(null);
    // Prefer BG authority for undo — UI projection may lag.
    let previousAuthorityChainId = chainStore.selectedChainId;
    try {
      const { chainId } = await new InExtensionMessageRequester().sendMessage(
        BACKGROUND_PORT,
        new GetSelectedChainIdMsg()
      );
      if (chainId) {
        previousAuthorityChainId = chainId;
      }
    } catch {
      // Fall back to projected selection.
    }

    const requester = new InExtensionMessageRequester();
    let persistCommitted = false;

    const waitingSuperseded = () => {
      const waiting = signInteractionStore.waitingData;
      return (
        !waiting ||
        waiting.id !== interactionId ||
        waiting.data.chainId !== waitingChainId
      );
    };

    const runUndoPersistAfterSupersede = () =>
      undoPersistAfterSupersede({
        clearTicket: () => clearSignSwitchTicketBg(interactionId),
        invalidateGateCache,
        previousAuthorityChainId,
        effectiveChainId,
        restorePreviousAuthority: async (chainId) => {
          await flowResult(chainStore.selectChainAndPersist(chainId));
        },
      });

    try {
      // Identity only — Cardano live gate is why this CTA exists.
      assertSignApproveStillValid(
        signInteractionStore.waitingData,
        interactionId,
        waitingChainId
      );

      await flowResult(chainStore.selectChainAndPersist(effectiveChainId));
      persistCommitted = true;

      // Select ACK succeeded — issue BG ticket (valid under projection lag).
      await requester.sendMessage(
        BACKGROUND_PORT,
        new IssueSignSwitchTicketMsg(interactionId, effectiveChainId)
      );
      // Drop any pre-Issue GetSignSwitchTicketValid that raced with surfaces-sync
      // after Persist (those answers saw no ticket and would write false).
      invalidateGateCache();
      const valid = await refreshSwitchTicket();
      if (!valid) {
        throw new Error("Sign switch ticket was not accepted");
      }

      assertSignApproveStillValid(
        signInteractionStore.waitingData,
        interactionId,
        waitingChainId
      );
    } catch (error) {
      if (persistCommitted && waitingSuperseded()) {
        // Issue / post-Issue refresh / assert — any path after Persist when A→B
        // replaced waiting (incl. unmount Clear racing refresh).
        await runUndoPersistAfterSupersede();
      } else if (persistCommitted) {
        // Same interaction still waiting: drop orphan ticket; keep Persist so
        // match arm / retry can proceed on the requested network.
        await clearTicketOnSignDismiss({
          clearTicket: () => clearSignSwitchTicketBg(interactionId),
          invalidateGateCache,
        });
      }
      setSwitchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSwitchingNetwork(false);
    }
  };

  if (initError) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div style={{ color: "#e74c3c", maxWidth: "320px" }}>{initError}</div>
        <ButtonV2
          variant="dark"
          text="Reject"
          styleProps={{ height: "48px", width: "200px" }}
          onClick={onReject}
        />
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <i className="fas fa-spinner fa-spin fa-2x text-gray" />
      </div>
    );
  }

  return (
    <div>
      <Dropdown
        styleProp={{ height: "98%" }}
        title={"Confirm transaction"}
        closeClicked={() => {
          void onReject();
        }}
        setIsOpen={setIsOpen}
        isOpen={isOpen}
      >
        {needsCardanoNetworkSwitch ? (
          <div
            style={{
              margin: "12px 16px",
              padding: "12px",
              borderRadius: "8px",
              background: "rgba(231, 76, 60, 0.08)",
              color: "#333",
              fontSize: "14px",
            }}
          >
            <div style={{ marginBottom: "8px" }}>
              This Cardano request needs the active network set to{" "}
              <b>{requested.chainInfo.chainName ?? effectiveChainId}</b> before
              signing. The global network was not changed when this request
              opened.
            </div>
            {switchError ? (
              <div style={{ color: "#e74c3c", marginBottom: "8px" }}>
                {switchError}
              </div>
            ) : null}
            <ButtonV2
              variant="dark"
              text={
                switchingNetwork ? (
                  <i className="fas fa-spinner fa-spin" />
                ) : (
                  "Switch network and continue"
                )
              }
              disabled={switchingNetwork}
              styleProps={{ height: "44px", width: "100%" }}
              onClick={onSwitchNetwork}
            />
          </div>
        ) : switchError ? (
          <div
            style={{
              margin: "12px 16px",
              color: "#e74c3c",
              fontSize: "14px",
            }}
          >
            {switchError}
          </div>
        ) : null}
        <TabsPanel tabs={tabs} tabHeight={calculateHeight()} />
        {ledgerInfo ? (
          <div
            style={{
              position: "fixed",
              bottom: "80px",
              width: "94%",
            }}
          >
            <LedgerBox
              isWarning={ledgerInfo.isWarning}
              title={ledgerInfo.title}
              ledgerError={ledgerInfo.ledgerError}
            />
          </div>
        ) : null}
        <div className={style["buttons"]}>
          {keyRingStore.keyRingType === "ledger" && approveButtonClicked ? (
            <ButtonV2
              variant="dark"
              styleProps={{
                position: "fixed",
                bottom: "12px",
                width: "94%",
                height: "56px",
              }}
              disabled={approveButtonClicked}
              btnBgEnabled={true}
              text={
                <div>
                  <FormattedMessage id="sign.button.confirm-ledger" />{" "}
                  <i className="fa fa-spinner fa-spin fa-fw" />
                </div>
              }
            />
          ) : (
            <ButtonV2
              variant="dark"
              styleProps={{
                position: "fixed",
                bottom: "12px",
                width: "94%",
                height: "56px",
              }}
              disabled={
                approveIsDisabled ||
                signInteractionStore.isLoading ||
                accountInfo.broadcastInProgress
              }
              btnBgEnabled={true}
              text={
                accountInfo.broadcastInProgress ? (
                  <span>
                    <i className="fas fa-spinner fa-spin ml-2" />{" "}
                    {approveButtonClicked
                      ? "Transaction in progress"
                      : "Previous transaction in progress"}
                  </span>
                ) : signInteractionStore.isLoading ? (
                  <i className="fas fa-spinner fa-spin ml-2" />
                ) : (
                  "Approve transaction"
                )
              }
              data-loading={signInteractionStore.isLoading}
              onClick={async (e: any) => {
                try {
                  e.preventDefault();
                  setApproveButtonClicked(true);

                  const assertStillValid = async () => {
                    // Fail-closed UI caches, then authority, then ticket LAST.
                    invalidateGateCache();
                    const {
                      authorityChainId: bgAuthorityChainId,
                      ticketValid,
                    } = await resolvePreApproveGateReads({
                      refreshAuthorityChainId,
                      queryTicketValid: queryTicketValidForApprove,
                    });
                    assertSignApproveStillValid(
                      signInteractionStore.waitingData,
                      interactionId,
                      waitingChainId,
                      {
                        requestedRegistryChainId: effectiveChainId,
                        authorityChainId: bgAuthorityChainId,
                        isADR36,
                        switchTicketValid: ticketValid,
                      }
                    );
                  };

                  setSwitchError(null);
                  await assertStillValid();

                  if (
                    keyRingStore.keyRingType === "ledger" &&
                    !ledgerInitStore.isInitNeeded
                  ) {
                    if (!(await testUSBDevices(ledgerInitStore.isWebHID))) {
                      throw new WalletError(
                        ErrModuleLedgerSign,
                        ErrFailedInit,
                        "Connect and unlock your Ledger device."
                      );
                    } else {
                      await ledgerInitStore.tryLedgerInit(
                        ethSignType ? LedgerApp.Ethereum : LedgerApp.Cosmos,
                        ethSignType ? "Ethereum" : "Cosmos"
                      );
                    }
                  }

                  await assertStillValid();

                  if (keyRingStore.keyRingType === "ledger") {
                    setLedgerInfo({
                      isWarning: false,
                      title: "Sign on Ledger",
                      ledgerError: new WalletError(
                        ErrModuleLedgerSign,
                        ErrFailedUnknown,
                        "To proceed, please review and approve the transaction on your Ledger device."
                      ),
                    });
                  }

                  if (needSetIsProcessing) {
                    setIsProcessing(true);
                  }

                  if (signDocHelper.signDocWrapper) {
                    await signInteractionStore.approveAndWaitEnd(
                      signDocHelper.signDocWrapper
                    );
                  }

                  if (
                    interactionInfo.interaction &&
                    !interactionInfo.interactionInternal
                  ) {
                    window.close();
                  }
                } catch (e) {
                  setApproveButtonClicked(false);

                  if (
                    e instanceof WalletError &&
                    e.module === ErrModuleLedgerSign
                  ) {
                    setLedgerInfo({
                      isWarning: true,
                      title: "Error",
                      ledgerError: e,
                    });
                  } else {
                    setSwitchError(e instanceof Error ? e.message : String(e));
                  }
                }
              }}
            />
          )}
        </div>
      </Dropdown>
    </div>
  );
});

export const SignPageV2: FunctionComponent = observer(() => {
  const { chainStore, signInteractionStore } = useStore();
  const navigate = useNavigate();
  const waiting = signInteractionStore.waitingData;
  const waitingIdRef = useRef<string | undefined>(waiting?.id);
  waitingIdRef.current = waiting?.id;

  const prepared = useMemo(
    () => prepareSignRequest(chainStore, waiting),
    [chainStore, waiting]
  );

  const interactionInfo = useInteractionInfo(() => {
    void clearTicketOnSignDismiss({
      clearTicket: () => clearSignSwitchTicketBg(waitingIdRef.current),
    });
    signInteractionStore.rejectAll();
  });

  if (!waiting) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <i className="fas fa-spinner fa-spin fa-2x text-gray" />
      </div>
    );
  }

  if (!prepared.ok) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div style={{ color: "#e74c3c", maxWidth: "320px" }}>
          {formatPrepareError(prepared.error)}
        </div>
        <ButtonV2
          variant="dark"
          text="Reject"
          styleProps={{ height: "48px", width: "200px" }}
          onClick={async () => {
            await clearTicketOnSignDismiss({
              clearTicket: () => clearSignSwitchTicketBg(waiting.id),
            });
            await signInteractionStore.rejectAll();
            if (
              interactionInfo.interaction &&
              !interactionInfo.interactionInternal
            ) {
              window.close();
            } else {
              navigate("/");
            }
          }}
        />
      </div>
    );
  }

  return (
    <RequestedChainProvider value={prepared.requested}>
      <SignRequestContent
        key={prepared.interactionId}
        requested={prepared.requested}
        interactionId={prepared.interactionId}
        waitingChainId={waiting.data.chainId}
        isADR36={prepared.isADR36}
      />
    </RequestedChainProvider>
  );
});
