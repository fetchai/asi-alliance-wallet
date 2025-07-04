import React, { FunctionComponent } from "react";

import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";

import styleDetailsTab from "./details-tab.module.scss";

import { renderAminoMessage } from "./amino";
import { Msg } from "@keplr-wallet/types";
import { FormattedMessage, useIntl } from "react-intl";
import { MemoInput } from "@components-v2/form";
import {
  IFeeConfig,
  IGasConfig,
  IMemoConfig,
  SignDocHelper,
} from "@keplr-wallet/hooks";
import { useLanguage } from "../../languages";
import { Button, Label } from "reactstrap";
import { renderDirectMessage } from "./direct";
import { AnyWithUnpacked } from "@keplr-wallet/cosmos";
import { CoinPretty } from "@keplr-wallet/unit";
import { FeeButtons } from "@components-v2/form/fee-buttons-v2";

export const DetailsTab: FunctionComponent<{
  signDocHelper: SignDocHelper;
  memoConfig: IMemoConfig;
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;

  isInternal: boolean;

  preferNoSetFee: boolean;
  preferNoSetMemo: boolean;

  isNeedLedgerEthBlindSigning: boolean;
}> = observer(
  ({
    signDocHelper,
    memoConfig,
    feeConfig,
    gasConfig,
    isInternal,
    preferNoSetFee,
    preferNoSetMemo,
    isNeedLedgerEthBlindSigning,
  }) => {
    const { chainStore, priceStore, accountStore, signInteractionStore } =
      useStore();
    const intl = useIntl();
    const language = useLanguage();
    // Check if the fee is set manually from external interaction.
    const manualFeeExternal = Boolean(
      !signInteractionStore.waitingData?.isInternal &&
        signInteractionStore.waitingData?.data?.signDocWrapper?.fees?.[0]
    );
    const mode = signDocHelper.signDocWrapper
      ? signDocHelper.signDocWrapper.mode
      : "none";
    const msgs = signDocHelper.signDocWrapper
      ? signDocHelper.signDocWrapper.mode === "amino"
        ? signDocHelper.signDocWrapper.aminoSignDoc.msgs
        : signDocHelper.signDocWrapper.protoSignDoc.txMsgs
      : [];
    const isEvm = chainStore.current.features?.includes("evm") ?? false;

    const renderedMsgs = (() => {
      if (mode === "amino") {
        return (msgs as readonly Msg[]).map((msg, i) => {
          const msgContent = renderAminoMessage(
            accountStore.getAccount(chainStore.current.chainId),
            msg,
            chainStore.current.currencies,
            intl
          );
          return (
            <React.Fragment key={i.toString()}>
              <MsgRender title={msgContent.title}>
                {msgContent.content}
              </MsgRender>
              <hr />
            </React.Fragment>
          );
        });
      } else if (mode === "direct") {
        return (msgs as AnyWithUnpacked[]).map((msg, i) => {
          const msgContent = renderDirectMessage(
            msg,
            chainStore.current.currencies,
            intl
          );
          return (
            <React.Fragment key={i.toString()}>
              <MsgRender title={msgContent.title}>
                {msgContent.content}
              </MsgRender>
              <hr />
            </React.Fragment>
          );
        });
      } else {
        return null;
      }
    })();

    return (
      <div className={styleDetailsTab["container"]}>
        <Label
          for="signing-messages"
          className={styleDetailsTab["signMessageLabel"]}
        >
          {msgs.length} <FormattedMessage id="sign.list.messages.label" />
        </Label>
        <div id="signing-messages" className={styleDetailsTab["msgContainer"]}>
          {renderedMsgs}
        </div>
        <div style={{ flex: 1 }} />
        {!preferNoSetMemo ? (
          <div>
            <MemoInput
              memoConfig={memoConfig}
              label={intl.formatMessage({ id: "sign.info.memo" })}
              rows={1}
            />
            <div
              style={{
                marginTop: "18px",
              }}
            />
          </div>
        ) : (
          <div>
            <Label for="memo" className={styleDetailsTab["label"]}>
              <FormattedMessage id="sign.info.memo" />
            </Label>
            <div
              id="memo"
              style={{ marginBottom: "18px" }}
              className={styleDetailsTab["memoInput"]}
            >
              <div
                className={styleDetailsTab["cards"]}
                style={{ color: memoConfig.memo ? undefined : "inherit" }}
              >
                {memoConfig.memo
                  ? memoConfig.memo
                  : intl.formatMessage({ id: "sign.info.warning.empty-memo" })}
              </div>
            </div>
          </div>
        )}
        {(!preferNoSetFee && !manualFeeExternal) || !feeConfig.isManual ? (
          <FeeButtons
            feeConfig={feeConfig}
            gasConfig={gasConfig}
            priceStore={priceStore}
            label={intl.formatMessage({ id: "sign.info.fee" })}
            gasLabel={intl.formatMessage({ id: "sign.info.gas" })}
            showFeeCurrencySelectorUnderSetGas={true}
          />
        ) : (
          <React.Fragment>
            <Label for="fee-price" className={styleDetailsTab["label"]}>
              <FormattedMessage id="sign.info.fee" />
            </Label>
            <div
              id="fee-price"
              style={{
                padding: "4px 8px",
              }}
              className={styleDetailsTab["cards"]}
            >
              <div>
                {(() => {
                  // To modify the gas in the current component composition,
                  // the fee buttons component should be shown.
                  // However, if the fee amount is an empty array, the UI to show is ambiguous.
                  // Therefore, if the fee amount is an empty array, it is displayed as 0 fee in some asset.
                  const feeOrZero =
                    feeConfig.fee ??
                    (() => {
                      if (chainStore.current.feeCurrencies.length === 0) {
                        return new CoinPretty(
                          chainStore.current.stakeCurrency,
                          "0"
                        );
                      }

                      return new CoinPretty(
                        chainStore.current.feeCurrencies[0],
                        "0"
                      );
                    })();

                  const fee = feeOrZero
                    .hideIBCMetadata(true)
                    .trim(true)
                    .toMetricPrefix(isEvm);

                  return (
                    <div className={styleDetailsTab["feePrice"]}>
                      {fee !== "0"
                        ? fee
                        : feeOrZero.maxDecimals(6).trim(true).toString()}
                      {priceStore.calculatePrice(
                        feeOrZero,
                        language.fiatCurrency
                      ) ? (
                        <div
                          className={`ml-2 ${styleDetailsTab["feePriceFiat"]}`}
                        >
                          {priceStore
                            .calculatePrice(feeOrZero, language.fiatCurrency)
                            ?.toString()}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            </div>
            {
              /*
                Even if the "preferNoSetFee" option is turned on, it provides the way to edit the fee to users.
                However, if the interaction is internal, you can be sure that the fee is set well inside Keplr.
                Therefore, the button is not shown in this case.
              */
              !isInternal ? (
                <div style={{ fontSize: "12px" }}>
                  <Button
                    color="link"
                    size="sm"
                    style={{
                      padding: 0,
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      feeConfig.setFeeType("average");
                    }}
                  >
                    <FormattedMessage id="sign.info.fee.override" />
                  </Button>
                </div>
              ) : null
            }
          </React.Fragment>
        )}
        {isNeedLedgerEthBlindSigning ? (
          <div className={styleDetailsTab["ethLedgerBlindSigningWarning"]}>
            <div className={styleDetailsTab["title"]}>
              Before you click ‘Approve’
            </div>
            <ul className={styleDetailsTab["list"]}>
              <li>Connect your Ledger device and select the Ethereum app</li>
              <li>Enable ‘blind signing’ on your Ledger device</li>
            </ul>
          </div>
        ) : null}
      </div>
    );
  }
);

export const MsgRender: FunctionComponent<{
  title: string;
}> = ({ title, children }) => {
  return (
    <div className={styleDetailsTab["msg"]}>
      <div className={styleDetailsTab["contentContainer"]}>
        <div className={styleDetailsTab["contentTitle"]}>{title}</div>
        <div className={styleDetailsTab["content"]}>{children}</div>
      </div>
    </div>
  );
};
