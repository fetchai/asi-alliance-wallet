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
import { CoinPretty, Dec, Int } from "@keplr-wallet/unit";
import { removeComma } from "@utils/format";
import style from "./style.module.scss";
import { SendConfigs } from "./types";
import {
  BuildSendAdaTxDraftMsg,
  CardanoSyncStatusResponse,
  DiscardSendAdaTxDraftMsg,
  GetCardanoSyncStatusMsg,
  GetMaxSpendableAdaMsg,
} from "@keplr-wallet/background";
import type { BuildSendAdaTxDraftResult } from "@keplr-wallet/background";
import { lovelacesToAdaString } from "@keplr-wallet/cardano";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { CARDANO_NATIVE_TOKEN_TYPE } from "@keplr-wallet/stores";
import { getCardanoAdaBelowMinimumError } from "./send-phase-2-helpers";

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
    const [
      cardanoProtocolMinOutputLovelace,
      setCardanoProtocolMinOutputLovelace,
    ] = useState<string | null>(null);
    const navigate = useNavigate();
    const intl = useIntl();
    useEffect(() => {
      setIsNext(false);
      setFromPhase1(true);
    }, []);

    const isCardano = chainStore.current.features?.includes("cardano") ?? false;
    const cardanoDenom = chainStore.current.stakeCurrency.coinDenom;
    const nativeAdaCoinDecimals = chainStore.current.stakeCurrency.coinDecimals;
    const sendCurrency = sendConfigs.amountConfig.sendCurrency;
    const sendCurrencyCoinDecimals =
      sendCurrency?.coinDecimals ?? nativeAdaCoinDecimals;
    const isNativeAdaSend =
      new DenomHelper(sendCurrency.coinMinimalDenom).type === "native";

    useEffect(() => {
      if (!isCardano || !isNativeAdaSend) {
        setCardanoProtocolMinOutputLovelace(null);
        return;
      }

      const bech32Address = accountInfo.bech32Address?.trim();
      if (!bech32Address) {
        setCardanoProtocolMinOutputLovelace(null);
        return;
      }

      let cancelled = false;
      setCardanoProtocolMinOutputLovelace(null);
      void (async () => {
        try {
          const requester = new InExtensionMessageRequester();
          const syncStatus = (await requester.sendMessage(
            BACKGROUND_PORT,
            new GetCardanoSyncStatusMsg(
              chainStore.current.chainId,
              document.hidden ? "background" : "foreground"
            )
          )) as CardanoSyncStatusResponse | undefined;

          if (
            cancelled ||
            syncStatus?.state !== "ready_with_data" ||
            !syncStatus?.isSettled
          ) {
            return;
          }

          const res = (await requester.sendMessage(
            BACKGROUND_PORT,
            new BuildSendAdaTxDraftMsg(
              bech32Address,
              "0",
              undefined,
              chainStore.current.chainId,
              undefined,
              true
            )
          )) as BuildSendAdaTxDraftResult | null;

          if (cancelled) {
            if (res?.kind === "draft") {
              void requester
                .sendMessage(
                  BACKGROUND_PORT,
                  new DiscardSendAdaTxDraftMsg(res.draftId)
                )
                .catch(() => {});
            }
            return;
          }

          if (res?.kind === "minimum_violation" && res.minimumOutputLovelace) {
            setCardanoProtocolMinOutputLovelace(res.minimumOutputLovelace);
          } else if (res?.kind === "draft") {
            void requester
              .sendMessage(
                BACKGROUND_PORT,
                new DiscardSendAdaTxDraftMsg(res.draftId)
              )
              .catch(() => {});
          }
        } catch {
          if (!cancelled) {
            setCardanoProtocolMinOutputLovelace(null);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [
      isCardano,
      isNativeAdaSend,
      accountInfo.bech32Address,
      chainStore.current.chainId,
    ]);

    const cardanoAdaMinError =
      isCardano && isNativeAdaSend
        ? getCardanoAdaBelowMinimumError({
            amountStr: sendConfigs.amountConfig.amount ?? "",
            minimumOutputLovelace: cardanoProtocolMinOutputLovelace,
            sendCurrencyCoinDecimals,
            cardanoDenom,
            nativeAdaCoinDecimals,
            amountError: sendConfigs.amountConfig.error,
          })
        : null;

    return (
      <div>
        <CoinInput
          onPress={async () => {
            const denomHelper = new DenomHelper(
              sendConfigs.amountConfig.sendCurrency.coinMinimalDenom
            );
            const isTokenSend = denomHelper.type === CARDANO_NATIVE_TOKEN_TYPE;

            if (isCardano && !isTokenSend) {
              const decimals =
                sendConfigs.amountConfig.sendCurrency.coinDecimals ?? 6;
              const requester = new InExtensionMessageRequester();

              // Lace-like: use GetMaxSpendableAda only when wallet is synced
              try {
                const syncStatus = (await requester.sendMessage(
                  BACKGROUND_PORT,
                  new GetCardanoSyncStatusMsg(
                    chainStore.current.chainId,
                    document.hidden ? "background" : "foreground"
                  )
                )) as CardanoSyncStatusResponse | undefined;

                if (
                  syncStatus?.state === "ready_with_data" &&
                  syncStatus?.isSettled
                ) {
                  const maxLovelace = (await requester.sendMessage(
                    BACKGROUND_PORT,
                    new GetMaxSpendableAdaMsg(
                      chainStore.current.chainId,
                      accountInfo.bech32Address,
                      sendConfigs.recipientConfig.recipient || undefined,
                      sendConfigs.memoConfig.memo || undefined
                    )
                  )) as string;

                  if (maxLovelace && maxLovelace !== "0") {
                    sendConfigs.amountConfig.setAmount(
                      lovelacesToAdaString(maxLovelace, decimals)
                    );
                    return;
                  }
                }
              } catch {
                // Fall through to REST fallback
              }

              // Fallback: use last known balance (REST) when not synced or GetMaxSpendableAda fails
              const feeBuffer = new CoinPretty(
                sendConfigs.amountConfig.sendCurrency,
                new Int(500_000) // 0.5 ADA conservative buffer for fees
              );
              const maxAmount = balance.sub(feeBuffer);
              const safeMaxAmount = maxAmount.toDec().isNegative()
                ? new CoinPretty(
                    sendConfigs.amountConfig.sendCurrency,
                    new Int(0)
                  )
                : maxAmount;
              const actualAmount = safeMaxAmount
                .shrink(true)
                .hideDenom(true)
                .toString();
              sendConfigs.amountConfig.setAmount(removeComma(actualAmount));
              return;
            }

            // Cosmos / EVM: subtract fee from spendable balance
            const fees = sendConfigs.feeConfig.getFeeTypePrettyForFeeCurrency(
              sendConfigs?.feeConfig?.feeCurrencies?.[0],
              sendConfigs.feeConfig.feeType ?? "average"
            );
            const maxAmount = balance.sub(fees);
            const safeMaxAmount = maxAmount.toDec().isNegative()
              ? new CoinPretty(
                  sendConfigs.amountConfig.sendCurrency,
                  new Int(0)
                )
              : maxAmount;
            const actualAmount = safeMaxAmount
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
        {cardanoAdaMinError ? (
          <div
            className={style["sendInlineAlert"]}
            style={{
              background: "rgba(220, 53, 69, 0.1)",
              border: "1px solid rgba(220, 53, 69, 0.3)",
              color: "#dc3545",
            }}
          >
            <i
              className="fas fa-exclamation-circle"
              style={{ marginRight: "8px" }}
            />
            {cardanoAdaMinError}
          </div>
        ) : null}
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
              sendConfigs.amountConfig.error ||
              cardanoAdaMinError
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
