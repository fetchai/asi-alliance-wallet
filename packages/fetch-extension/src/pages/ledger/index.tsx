import React, {
  ChangeEvent,
  FunctionComponent,
  useEffect,
  useState,
} from "react";

import {
  Ledger,
  LedgerApp,
  LedgerWebHIDIniter,
  LedgerWebUSBIniter,
} from "@keplr-wallet/background";

import style from "./style.module.scss";

import { FormattedMessage, useIntl } from "react-intl";
import { useNotification } from "@components/notification";
import delay from "delay";
import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";
import { CosmosApp } from "@keplr-wallet/ledger-cosmos";
import { ButtonV2 } from "@components-v2/buttons/button";
import { useNavigate } from "react-router";
import { BackButton } from "../../pages-new/register";
import classnames from "classnames";
import { useUSBDevices } from "@utils/ledger";
import { WalletError } from "@keplr-wallet/router";
import { ErrCodeAppNotInitialised } from "@keplr-wallet/background/build/ledger/types";

export const LedgerSetupView: FunctionComponent<{
  onBackPress?: () => void;
  onInitSucceed: () => void;
}> = observer(({ onBackPress, onInitSucceed }) => {
  const { ledgerInitStore } = useStore();

  const intl = useIntl();
  const navigate = useNavigate();

  const notification = useNotification();

  const [showWebHIDWarning, setShowWebHIDWarning] = useState(false);

  const toggleWebHIDFlag = async (e: ChangeEvent) => {
    e.preventDefault();

    if (!ledgerInitStore.isWebHID && !(await Ledger.isWebHIDSupported())) {
      setShowWebHIDWarning(true);
      return;
    }
    setShowWebHIDWarning(false);

    await ledgerInitStore.setWebHID(!ledgerInitStore.isWebHID);
  };

  useEffect(() => {
    if (ledgerInitStore.isSignCompleted) {
      setTimeout(window.close, 3000);
    }

    if (ledgerInitStore.isGetPubKeySucceeded) {
      // Don't need to delay to close because this event probably occurs only in the register page in tab.
      // So, don't need to consider the window refocusing.
      window.close();
    }

    if (ledgerInitStore.isInitAborted) {
      // If ledger init is aborted due to the timeout on the background, just close the window.
      window.close();
    }
  }, [
    ledgerInitStore.isGetPubKeySucceeded,
    ledgerInitStore.isSignCompleted,
    ledgerInitStore.isInitAborted,
  ]);

  const [initTryCount, setInitTryCount] = useState(0);
  const [initErrorOn, setInitErrorOn] = useState<WalletError | undefined>(
    undefined
  );
  const [tryInitializing, setTryInitializing] = useState(false);
  const { testUSBDevices } = useUSBDevices();

  const tryInit = async () => {
    setTryInitializing(true);

    let initErrorOn: WalletError | undefined;

    try {
      if (!(await testUSBDevices(ledgerInitStore.isWebHID))) {
        throw new Error("There is no device selected");
      }

      const transportIniter = ledgerInitStore.isWebHID
        ? LedgerWebHIDIniter
        : LedgerWebUSBIniter;
      const transport = await transportIniter();
      try {
        if (ledgerInitStore.requestedLedgerApp === LedgerApp.Cosmos) {
          await CosmosApp.openApp(
            transport,
            ledgerInitStore.cosmosLikeApp || "Cosmos"
          );
        } else if (ledgerInitStore.requestedLedgerApp === LedgerApp.Ethereum) {
          await CosmosApp.openApp(transport, "Ethereum");
        }
      } catch (e) {
        // Ignore error
        console.log(e);
      } finally {
        await transport.close();

        await delay(500);
      }

      // I don't know the reason exactly.
      // However, we sometimes should wait for some until actually app opened.
      // It is hard to set exact delay. So, just wait for 500ms 5 times.
      let tempSuccess = false;
      for (let i = 0; i < 5; i++) {
        // Test again to ensure usb permission after interaction.
        if (await testUSBDevices(ledgerInitStore.isWebHID)) {
          tempSuccess = true;
          break;
        }

        await delay(500);
      }
      if (!tempSuccess) {
        throw new Error("There is no device selected");
      }

      const ledger = await Ledger.init(
        ledgerInitStore.isWebHID ? LedgerWebHIDIniter : LedgerWebUSBIniter,
        undefined,
        // requestedLedgerApp should be set if ledger init needed.
        ledgerInitStore.requestedLedgerApp!,
        ledgerInitStore.cosmosLikeApp || "Cosmos"
      );
      await ledger.close();
      // Unfortunately, closing ledger blocks the writing to Ledger on background process.
      // I'm not sure why this happens. But, not closing reduce this problem if transport is webhid.
      if (!ledgerInitStore.isWebHID) {
        delay(1000);
      } else {
        delay(500);
      }
    } catch (e) {
      console.log(e);

      initErrorOn = e;
    }

    setInitTryCount(initTryCount + 1);
    setInitErrorOn(initErrorOn);
    setTryInitializing(false);

    if (initErrorOn === undefined) {
      onInitSucceed();
      await ledgerInitStore.resume();
    }
  };

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "start",
        height: "95%",
      }}
    >
      <div className={style["ledgerContainer"]}>
        <BackButton
          onClick={async () => {
            ledgerInitStore.abortAll();
            if (onBackPress) {
              onBackPress();
            } else {
              navigate(-1);
            }
          }}
        />
        <div
          style={{ marginTop: "24px", marginBottom: "12px" }}
          className={style["pageTitle"]}
        >
          Please connect your hardware wallet
        </div>
        <Instruction
          icon={
            <img
              src={require("@assets/img/icons8-usb-2.svg")}
              style={{ height: "50px" }}
              alt="usb"
            />
          }
          title={intl.formatMessage({ id: "ledger.step1" })}
          paragraph={intl.formatMessage({ id: "ledger.step1.paragraph" })}
          selected={
            !(
              initErrorOn?.code === ErrCodeAppNotInitialised ||
              (initTryCount > 0 && initErrorOn == null)
            )
          }
          pass={
            initTryCount > 0 && initErrorOn?.code === ErrCodeAppNotInitialised
          }
        />
        <Instruction
          icon={
            <img
              src={(() => {
                switch (ledgerInitStore.requestedLedgerApp) {
                  case "ethereum":
                    return require("../../public/assets/img/ethereum.svg");
                  case "cosmos":
                    if (ledgerInitStore.cosmosLikeApp === "Terra") {
                      return require("../../public/assets/img/ledger-terra.svg");
                    }
                    return require("../../public/assets/img/atom-o.svg");
                  default:
                    return require("@assets/img/atom-o.svg");
                }
              })()}
              style={{ height: "34px" }}
              alt="atom"
            />
          }
          title={intl.formatMessage({ id: "ledger.step2" })}
          paragraph={intl.formatMessage(
            {
              id: "ledger.step2.paragraph",
            },
            {
              ledgerApp: (() => {
                switch (ledgerInitStore.requestedLedgerApp) {
                  case "ethereum":
                    return "Ethereum";
                  case "cosmos":
                    return ledgerInitStore.cosmosLikeApp || "Cosmos";
                  default:
                    return "Cosmos";
                }
              })(),
            }
          )}
          selected={
            initErrorOn?.code === ErrCodeAppNotInitialised ||
            (initTryCount > 0 && initErrorOn == null)
          }
          pass={initTryCount > 0 && initErrorOn == null}
        />
        <div style={{ flex: 1 }} />
        <div className="custom-control custom-checkbox mb-2">
          <input
            className={`custom-control-input ${style["ledgerCheckbox"]}`}
            id="use-webhid"
            type="checkbox"
            checked={ledgerInitStore.isWebHID}
            onChange={toggleWebHIDFlag}
          />
          <label
            className={`custom-control-label ${style["ledgerCheckboxLabel"]}`}
            htmlFor="use-webhid"
            style={{ color: "white", paddingTop: "6px" }}
          >
            <FormattedMessage id="ledger.option.webhid.checkbox" />
          </label>
        </div>
        {showWebHIDWarning ? (
          <div
            style={{
              fontSize: "14px",
              marginBottom: "20px",
              color: "white",
            }}
          >
            <FormattedMessage
              id="ledger.option.webhid.warning"
              values={{
                link: (
                  <a
                    href="chrome://flags/#enable-experimental-web-platform-features"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(
                          "chrome://flags/#enable-experimental-web-platform-features"
                        )
                        .then(() => {
                          notification.push({
                            placement: "top-center",
                            type: "success",
                            duration: 2,
                            content: intl.formatMessage({
                              id: "ledger.option.webhid.link.copied",
                            }),
                            canDelete: true,
                            transition: {
                              duration: 0.25,
                            },
                          });
                        });
                    }}
                  >
                    chrome://flags/#enable-experimental-web-platform-features
                  </a>
                ),
              }}
            />
          </div>
        ) : null}
        <div className={style["buttons"]}>
          <ButtonV2
            styleProps={{
              padding: "12px",
              height: "56px",
            }}
            text={
              tryInitializing ? (
                <i className="fas fa-spinner fa-spin ml-2" />
              ) : (
                <FormattedMessage id="ledger.button.next" />
              )
            }
            onClick={async (e: any) => {
              e.preventDefault();
              await tryInit();
            }}
            dataLoading={tryInitializing}
            disabled={tryInitializing}
          />
        </div>
      </div>
    </div>
  );
});

const Instruction: FunctionComponent<{
  icon: React.ReactElement;
  title: string;
  paragraph: string;
  pass: boolean;
  selected: boolean;
}> = ({ icon, title, paragraph, children, pass, selected }) => {
  return (
    <div
      className={classnames(style["instruction"], {
        [style["selected"]]: selected,
        [style["pass"]]: pass,
      })}
    >
      <div className={style["icon"]}>{icon}</div>
      <div className={style["inner"]}>
        <h1>
          {title}
          {pass ? (
            <i
              className="fas fa-check"
              style={{ marginLeft: "10px", color: "#2dce89" }}
            />
          ) : null}
        </h1>
        <p>{paragraph}</p>
        {children}
      </div>
    </div>
  );
};
