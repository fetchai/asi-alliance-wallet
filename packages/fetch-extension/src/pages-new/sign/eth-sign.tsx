import React, { FunctionComponent, useEffect, useMemo, useState } from "react";

import style from "./style.module.scss";

import { useStore } from "../../stores";
import { DataTab } from "./data-tab";
import { ADR36SignDocDetailsTab } from "./adr-36";

import { useNavigate } from "react-router";
import { observer } from "mobx-react-lite";
import { EthSignType } from "@keplr-wallet/types";

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

import { ErrFailedUnknown } from "@keplr-wallet/background/src/ledger/types";

import { ErrModuleLedgerSign } from "@keplr-wallet/background/build/ledger/types";

import { useInteractionInfo } from "@hooks/interaction";
import { handleExternalInteractionWithNoProceedNext } from "@utils/side-panel";
import { useUnmount } from "@hooks/use-unmount";
import { FormattedMessage } from "react-intl";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { handleEthereumPreSignByLedger } from "./utils/handle-eth-sign";

export const SignEthereumPage: FunctionComponent = observer(() => {
  const navigate = useNavigate();

  const {
    signEthereumInteractionStore,
    keyRingStore,
    ledgerInitStore,
    accountStore,
    chainStore,
  } = useStore();

  const current = chainStore.current;
  const interactionInfo = useInteractionInfo({
    onWindowClose: () => {
      signEthereumInteractionStore.rejectAll();
    },
    onUnmount: async () => {
      if (signEthereumInteractionStore.waitingData) {
        await signEthereumInteractionStore.rejectWithProceedNext(
          signEthereumInteractionStore.waitingData.id,
          () => {}
        );
      }
    },
  });

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

  const accountInfo = accountStore.getAccount(current.chainId);

  const [origin, setOrigin] = useState<string | undefined>();
  const [ethSignType, setEthSignType] = useState<EthSignType | undefined>();
  const [data, setData] = useState<string | Uint8Array>();

  const [approveButtonClicked, setApproveButtonClicked] = useState(false);

  const signingDataBuff = useMemo(() => {
    const message = signEthereumInteractionStore.waitingData?.data?.message;
    if (!message) return Buffer.from([]);
    const parsed = JSON.parse(Buffer.from(message).toString("utf8"));
    if (parsed.requiredErc20Approvals) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { requiredErc20Approvals: _, ...unsignedTx } = parsed;
      return Buffer.from(JSON.stringify(unsignedTx), "utf8");
    }
    return Buffer.from(message);
  }, [signEthereumInteractionStore.waitingData]);

  const signingDataText = useMemo(() => {
    // If the message is 32 bytes, it's probably a hash.
    if (signingDataBuff.length === 32) {
      return "0x" + signingDataBuff.toString("hex");
    } else {
      const text = (() => {
        const string = signingDataBuff.toString("utf8");
        if (string.startsWith("0x")) {
          const buf = Buffer.from(string.slice(2), "hex");

          try {
            // 정상적인 utf-8 문자열인지 확인
            const decoder = new TextDecoder("utf-8", { fatal: true });
            decoder.decode(new Uint8Array(buf)); // UTF-8 변환 시도
          } catch {
            // 정상적인 utf-8 문자열이 아니면 hex로 변환
            return "0x" + buf.toString("hex");
          }

          return buf.toString("utf8");
        }

        return string;
      })();

      // If the text contains RTL mark, escape it.
      return text.replace(/\u202E/giu, "\\u202E");
    }
  }, [signingDataBuff]);

  const [ledgerInfo, setLedgerInfo] = useState<
    LedgerGuideBoxProps | undefined
  >();
  // const { testUSBDevices } = useUSBDevices();

  const [sidePanelEnabled, setSidePanelEnabled] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    if (signEthereumInteractionStore.waitingData) {
      const d = signEthereumInteractionStore.waitingData;
      setOrigin(d.data.origin);
      setEthSignType(d.data.signType);
      setData(d?.data as any);
    }
  }, [signEthereumInteractionStore.waitingData]);

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

  const isLoaded =
    signEthereumInteractionStore.isObsoleteInteractionApproved(
      signEthereumInteractionStore?.waitingData?.id
    ) ||
    !!data ||
    currentChainIdentifier !== selectedChainIdentifier;

  const approveIsDisabled = !isLoaded;

  const tabs = [
    {
      id: "Details",
      component: (
        <ADR36SignDocDetailsTab
          signDocWrapper={undefined}
          isADR36WithString={false}
          ethSignType={ethSignType}
          ethData={signingDataText}
          origin={origin}
        />
      ),
    },
    {
      id: "Data",
      component: (
        <DataTab
          signDocHelper={undefined}
          ethSignType={ethSignType}
          ethData={signingDataText}
        />
      ),
    },
  ];

  useEffect(() => {
    const msg = new GetSidePanelIsSupportedMsg();

    new InExtensionMessageRequester()
      .sendMessage(BACKGROUND_PORT, msg)
      .then(() => {
        return new InExtensionMessageRequester().sendMessage(
          BACKGROUND_PORT,
          new GetSidePanelEnabledMsg()
        );
      })
      .then((res) => {
        setSidePanelEnabled(res.enabled);
      });
  }, []);

  function calculateHeight() {
    if (sidePanelEnabled) {
      return ledgerInfo ? "70%" : "80%";
    }

    return ledgerInfo ? "265px" : "320px";
  }

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
                      const interactionData =
                        signEthereumInteractionStore.waitingData;
                      if (interactionData) {
                        try {
                          setApproveButtonClicked(true);

                          let signature;
                          if (interactionData.data.keyType === "ledger") {
                            setApproveButtonClicked(true);
                            signature = await handleEthereumPreSignByLedger(
                              interactionData,
                              signingDataBuff as Uint8Array,
                              {
                                useWebHID: ledgerInitStore.isWebHID,
                              }
                            );
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

                          await signEthereumInteractionStore.approveWithProceedNext(
                            interactionData.id,
                            signingDataBuff as Uint8Array,
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
                                // XXX: 약간 난해한 부분인데
                                //      내부의 tx의 경우에는 tx 이후의 routing을 요청한 쪽에서 처리한다.
                                //      하지만 tx를 처리할때 tx broadcast 등의 과정이 있고
                                //      서명 페이지에서는 이러한 과정이 끝났는지 아닌지를 파악하기 힘들다.
                                //      만약에 밑과같은 처리를 하지 않으면 interaction data가 먼저 지워지면서
                                //      화면이 깜빡거리는 문제가 발생한다.
                                //      이 문제를 해결하기 위해서 내부의 tx는 보내는 쪽에서 routing을 잘 처리한다고 가정하고
                                //      페이지를 벗어나고 나서야 data를 지우도록한다.
                                await unmountPromise.promise;
                              }
                            },
                            {
                              preDelay: 200,
                            }
                          );
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
                          }
                        }
                      }
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
