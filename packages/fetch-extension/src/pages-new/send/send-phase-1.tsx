import React, { useState, useEffect } from "react";
import { useIntl } from "react-intl";
import { CoinInput, TokenSelectorDropdown } from "@components-v2/form";
import { DenomHelper } from "@keplr-wallet/common";
import { Dropdown } from "@components-v2/dropdown";
import { Card } from "@components-v2/card";
import { SetKeyRingPage } from "../keyring-dev";
import { useStore } from "../../stores";
import { ButtonV2 } from "@components-v2/buttons/button";
import { Label } from "reactstrap";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import { removeComma } from "@utils/format";
import style from "./style.module.scss";
import { SendConfigs } from "./types";

interface SendPhase1Props {
  sendConfigs: SendConfigs;
  setIsNext: any;
  setFromPhase1: any;
  balance: CoinPretty;
}

export const SendPhase1: React.FC<SendPhase1Props> = observer(
  ({ setIsNext, balance, sendConfigs, setFromPhase1 }) => {
    const [isChangeWalletOpen, setIsChangeWalletOpen] = useState(false);
    const { chainStore, accountStore, analyticsStore } = useStore();
    const accountInfo = accountStore.getAccount(chainStore.current.chainId);
    const [isMaxAmount, setIsMaxAmount] = useState(false);
    const navigate = useNavigate();
    const intl = useIntl();
    useEffect(() => {
      setIsNext(false);
      setFromPhase1(true);
    }, []);

    return (
      <div>
        <CoinInput
          onPress={() => {
            const fees = sendConfigs.feeConfig.getFeeTypePrettyForFeeCurrency(
              sendConfigs?.feeConfig?.feeCurrencies?.[0],
              sendConfigs.feeConfig.feeType ?? "average" // fee type is not set at this point, so default to average
            );
            // subtract fee from balance to set max amount to avoid insufficient balance error
            const actualAmount = balance
              .sub(fees)
              .shrink(true)
              .hideDenom(true)
              .toString();
            sendConfigs.amountConfig.setAmount(removeComma(actualAmount));
            setIsMaxAmount(true);
          }}
          onAmountChange={(_) => setIsMaxAmount(false)}
          amountConfig={sendConfigs.amountConfig}
          label={intl.formatMessage({ id: "send.input.amount" })}
          balanceText={intl.formatMessage({
            id: "send.input-button.balance",
          })}
          showAllBalance={(() => {
            if (
              // In the case of terra classic, tax is applied in proportion to the amount.
              // However, in this case, the tax itself changes the fee,
              // so if you use the max function, it will fall into infinite repetition.
              // We currently disable if chain is terra classic because we can't handle it properly.
              sendConfigs.feeConfig.chainInfo.features &&
              sendConfigs.feeConfig.chainInfo.features.includes(
                "terra-classic-fee"
              )
            ) {
              return true;
            }
            return false;
          })()}
          disableAllBalance={balance.toDec().lte(new Dec(0))}
          overrideSelectableCurrencies={(() => {
            if (
              chainStore.current.features &&
              chainStore.current.features.includes("terra-classic-fee")
            ) {
              // At present, can't handle stability tax well if it is not registered native token.
              // So, for terra classic, disable other tokens.
              const currencies = sendConfigs.amountConfig.sendableCurrencies;
              return currencies.filter((cur: any) => {
                const denom = new DenomHelper(cur.coinMinimalDenom);
                if (denom.type !== "native" || denom.denom.startsWith("ibc/")) {
                  return false;
                }
                return true;
              });
            }
            return undefined;
          })()}
        />
        <TokenSelectorDropdown amountConfig={sendConfigs.amountConfig} />
        <Label className={style["label"]}>Send from</Label>
        <Card
          style={{
            background: "white",
            border: "1px solid var(--bg-grey-dark)",
            color: "var(--font-dark)",
            fontSize: "14px",
            padding: "12px 18px",
          }}
          headingStyle={{
            fontSize: "14px",
            fontWeight: 400,
            opacity: "1",
          }}
          heading={accountInfo.name}
          rightContent={require("@assets/svg/wireframe/chevron-down.svg")}
          onClick={() => {
            setIsChangeWalletOpen(!isChangeWalletOpen);
            analyticsStore.logEvent("send_from_click", {
              pageName: "Send",
            });
          }}
        />
        <ButtonV2
          variant="dark"
          disabled={Boolean(
            sendConfigs.amountConfig.amount === "" ||
              sendConfigs.amountConfig.error
          )}
          text="Next"
          onClick={() => {
            setIsNext(true);
            navigate("/send", { state: { isFromPhase1: true, isMaxAmount } });
            analyticsStore.logEvent("next_click", { pageName: "Send" });
          }}
          styleProps={{
            width: "94%",
            padding: "12px",
            height: "56px",
            margin: "0 auto",
            position: "fixed",
            bottom: "15px",
            left: "0px",
            right: "0px",
          }}
          btnBgEnabled={true}
        />
        <Dropdown
          isOpen={isChangeWalletOpen}
          setIsOpen={setIsChangeWalletOpen}
          title="Select Wallet"
          closeClicked={() => {
            setIsChangeWalletOpen(false);
            analyticsStore.logEvent("select_wallet_click", {
              pageName: "Send",
            });
          }}
        >
          <SetKeyRingPage
            navigateTo={"/send"}
            onItemSelect={() => setIsChangeWalletOpen(false)}
          />
        </Dropdown>
      </div>
    );
  }
);
