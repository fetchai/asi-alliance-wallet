import React, { FunctionComponent, useEffect, useMemo, useState } from "react";

import style from "./style.module.scss";

import { useStore } from "../../stores";

import { DataTab } from "./data-tab";
import { DetailsTab } from "./details-tab";
import { FormattedMessage } from "react-intl";

import { useNavigate } from "react-router";
import { observer } from "mobx-react-lite";
import {
  useFeeConfig,
  useMemoConfig,
  useSignDocAmountConfig,
  useSignDocHelper,
  useZeroAllowedGasConfig,
} from "@keplr-wallet/hooks";
import { ADR36SignDocDetailsTab } from "./adr-36";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { unescapeHTML } from "@keplr-wallet/common";
import { Dropdown } from "@components-v2/dropdown";
import { TabsPanel } from "@components-v2/tabs/tabsPanel-2";
import { ButtonV2 } from "@components-v2/buttons/button";
import {
  GetSidePanelEnabledMsg,
  GetSidePanelIsSupportedMsg,
} from "@keplr-wallet/background";
import { LedgerBox, LedgerGuideBoxProps } from "./ledger-guide-box";
// import { useUSBDevices } from "@utils/ledger";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import {
  BACKGROUND_PORT,
  KeplrError as WalletError,
} from "@keplr-wallet/router";
import { ErrFailedInit } from "@keplr-wallet/background/src/ledger/types";
import {
  ErrFailedUnknown,
  ErrModuleLedgerSign,
} from "@keplr-wallet/background/build/ledger/types";
import { useInteractionInfo } from "@hooks/interaction";
import { useUnmount } from "@hooks/use-unmount";
import { handleCosmosPreSign } from "./utils/handle-cosmos-sign";
import { handleExternalInteractionWithNoProceedNext } from "@utils/side-panel";

export const SignPageV2: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const {
    chainStore,
    keyRingStore,
    signInteractionStore,
    accountStore,
    queriesStore,
    ledgerInitStore,
  } = useStore();
  const current = chainStore.current;
  // If the preferNoSetFee or preferNoSetMemo in sign options is true,
  // don't show the fee buttons/memo input by default
  // But, the sign options would be removed right after the users click the approve/reject button.
  // Thus, without this state, the fee buttons/memo input would be shown after clicking the approve buttion.
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

  const interactionInfo = useInteractionInfo({
    onWindowClose: () => {
      if (needSetIsProcessing) {
        setIsProcessing(true);
      }
      signInteractionStore.rejectAll();
    },
    onUnmount: async () => {
      if (signInteractionStore?.waitingData) {
        signInteractionStore.rejectWithProceedNext(
          signInteractionStore.waitingData?.id,
          () => {}
        );
      }
    },
  });

  const accountInfo = accountStore.getAccount(chainStore.current.chainId);
  const [signer, setSigner] = useState("");
  const [origin, setOrigin] = useState<string | undefined>();
  const [isADR36WithString, setIsADR36WithString] = useState<
    boolean | undefined
  >();
  const [approveButtonClicked, setApproveButtonClicked] = useState(false);
  // const { testUSBDevices } = useUSBDevices();
  const [ledgerInfo, setLedgerInfo] = useState<
    LedgerGuideBoxProps | undefined
  >();
  const [sidePanelEnabled, setSidePanelEnabled] = useState(false);

  // There are services that sometimes use invalid tx to sign arbitrary data on the sign page.
  // In this case, there is no obligation to deal with it, but 0 gas is favorably allowed.
  const gasConfig = useZeroAllowedGasConfig(chainStore, current.chainId, 0);
  const amountConfig = useSignDocAmountConfig(
    chainStore,
    accountStore,
    current.chainId,
    signer
  );
  const feeConfig = useFeeConfig(
    chainStore,
    queriesStore,
    current.chainId,
    signer,
    amountConfig,
    gasConfig
  );
  const memoConfig = useMemoConfig(chainStore, current.chainId);

  const signDocHelper = useSignDocHelper(feeConfig, memoConfig);
  amountConfig.setSignDocHelper(signDocHelper);

  const [unmountPromise] = useState(() => {
    let resolver: () => void;
    const promise = new Promise<void>((resolve) => {
      resolver = resolve;
    });

    return {
      promise,
      resolver: resolver!,
    };
  });

  useUnmount(() => {
    unmountPromise.resolver();
  });

  useEffect(() => {
    if (signInteractionStore.waitingData) {
      const data = signInteractionStore.waitingData;
      chainStore.selectChain(data.data.chainId);
      if (data.data.signDocWrapper.isADR36SignDoc) {
        setIsADR36WithString(data.data.signDocWrapper.isADR36SignDoc);
      }
      setOrigin(data.data.origin);
      if (
        !data.data.signDocWrapper.isADR36SignDoc &&
        data.data.chainId !== data.data.signDocWrapper.chainId
      ) {
        // Validate the requested chain id and the chain id in the sign doc are same.
        // If the sign doc is for ADR-36, there is no chain id in the sign doc, so no need to validate.
        throw new Error("Chain id unmatched");
      }
      signDocHelper.setSignDocWrapper(data.data.signDocWrapper);
      gasConfig.setGas(data.data.signDocWrapper.gas);
      let memo = data.data.signDocWrapper.memo;
      if (data.data.signDocWrapper.mode === "amino") {
        // For amino-json sign doc, the memo is escaped by default behavior of golang's json marshaller.
        // For normal users, show the escaped characters with unescaped form.
        // Make sure that the actual sign doc's memo should be escaped.
        // In this logic, memo should be escaped from account store or background's request signing function.
        memo = unescapeHTML(memo);
      }
      memoConfig.setMemo(memo);
      if (
        data.data.signOptions.preferNoSetFee &&
        data.data.signDocWrapper.fees[0]
      ) {
        feeConfig.setManualFee(data.data.signDocWrapper.fees[0]);
      }
      amountConfig.setDisableBalanceCheck(
        !!data.data.signOptions.disableBalanceCheck
      );
      feeConfig.setDisableBalanceCheck(
        !!data.data.signOptions.disableBalanceCheck
      );
      if (
        data.data.signDocWrapper.granter &&
        data.data.signDocWrapper.granter !== data.data.signer
      ) {
        feeConfig.setDisableBalanceCheck(true);
      }
      setSigner(data.data.signer);
    }
  }, [
    amountConfig,
    chainStore,
    gasConfig,
    memoConfig,
    feeConfig,
    signDocHelper,
    signInteractionStore.waitingData,
  ]);

  const currentChainId = chainStore.current.chainId;
  const currentChainIdentifier = useMemo(
    () => ChainIdHelper.parse(currentChainId).identifier,
    [currentChainId]
  );
  const selectedChainId = chainStore.selectedChainId;
  const selectedChainIdentifier = useMemo(
    () => ChainIdHelper.parse(selectedChainId).identifier,
    [selectedChainId]
  );

  // Check that the request is delivered
  // and the chain is selected properly.
  // The chain store loads the saved chain infos including the suggested chain asynchronously on init.
  // So, it can be different the current chain and the expected selected chain for a moment.
  const isLoaded =
    (() => {
      if (!signDocHelper.signDocWrapper) {
        return false;
      }

      return currentChainIdentifier === selectedChainIdentifier;
    })() ||
    signInteractionStore.isObsoleteInteractionApproved(
      signInteractionStore?.waitingData?.id
    );

  // If this is undefined, show the chain name on the header.
  // If not, show the alternative title.

  const approveIsDisabled = (() => {
    if (!isLoaded) {
      return true;
    }

    if (!signDocHelper.signDocWrapper) {
      return true;
    }

    // If the sign doc is for ADR-36,
    // there is no error related to the fee or memo...
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
            accountStore.getAccount(current.chainId).isNanoLedger
          }
        />
      ),
    },
    {
      id: "Data",
      component: <DataTab signDocHelper={signDocHelper} />,
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
    /// Adjusting tab height according to ledger guide box
    if (sidePanelEnabled) {
      return ledgerInfo ? "70%" : "80%";
    }

    return ledgerInfo
      ? ledgerInfo.ledgerError.code === ErrFailedInit
        ? "245px"
        : "265px"
      : "320px";
  }

  const approve = async () => {
    const interactionData = signInteractionStore.waitingData;
    if (signDocHelper.signDocWrapper && interactionData) {
      let presignOptions;
      try {
        setApproveButtonClicked(true);
        if (interactionData.data.keyType === "ledger") {
          presignOptions = {
            useWebHID: ledgerInitStore.isWebHID,
            signEthPlainJSON: chainStore
              .getChain(
                signInteractionStore.waitingData?.data.chainId ??
                  current.chainId
              )
              .hasFeature("evm-ledger-sign-plain-json"),
          };
        }

        const signDocWrapper = signDocHelper.signDocWrapper;

        const signature = await handleCosmosPreSign(
          interactionData,
          signDocWrapper,
          presignOptions
        );

        if (interactionData.data.keyType === "ledger") {
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

        await signInteractionStore.approveWithProceedNext(
          interactionData.id,
          signDocWrapper,
          signature,
          async (proceedNext) => {
            if (!proceedNext) {
              if (
                interactionInfo.interaction &&
                !interactionInfo.interactionInternal
              ) {
                handleExternalInteractionWithNoProceedNext();
              }
            }
            if (
              interactionInfo.interaction &&
              interactionInfo.interactionInternal
            ) {
              await unmountPromise.promise;
            }
          },
          {
            preDelay: 200,
          }
        );
      } catch (e) {
        console.log(e);

        setApproveButtonClicked(false);

        if (e instanceof WalletError && e.module === ErrModuleLedgerSign) {
          setLedgerInfo({
            isWarning: true,
            title: "Error",
            ledgerError: e,
          });
        }
      }
    }
  };

  return (
    <div>
      {
        /*
         Show the informations of tx when the sign data is delivered.
         If sign data not delivered yet, show the spinner alternatively.
         */
        isLoaded ? (
          <div>
            <Dropdown
              styleProp={{ height: "98%" }}
              title={"Confirm transaction"}
              closeClicked={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  navigate("/");
                }
              }}
              setIsOpen={setIsOpen}
              isOpen={isOpen}
            >
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
                {keyRingStore.selectedKeyInfo?.type === "ledger" &&
                approveButtonClicked ? (
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
                      approveIsDisabled || accountInfo.broadcastInProgress
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
                      ) : (
                        "Approve transaction"
                      )
                    }
                    dataLoading={accountInfo.broadcastInProgress}
                    onClick={async (e: any) => {
                      e.preventDefault();
                      await approve();
                    }}
                  />
                )}
              </div>
            </Dropdown>
          </div>
        ) : (
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
        )
      }
    </div>
  );
});
