import {
  EmptyAmountError,
  InsufficientAmountError,
  InvalidNumberAmountError,
  NegativeAmountError,
  ZeroAmountError,
  useUndelegateTxConfig,
} from "@keplr-wallet/hooks";
import { observer } from "mobx-react-lite";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useStore } from "../../../stores";
import { useIntl } from "react-intl";
import { useNotification } from "@components/notification";
import { ButtonV2 } from "@components-v2/buttons/button";
import { Alert, FormGroup } from "reactstrap";
import style from "./style.module.scss";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { StakeInput } from "@components-v2/form/stake-input";
import { UseMaxButton } from "@components-v2/buttons/use-max-button";
import { FeeButtons, MemoInput } from "@components-v2/form";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { TXNTYPE } from "../../../config";

export const Unstake = observer(() => {
  const location = useLocation();
  const validatorAddress = location.pathname.split("/")[2];
  const navigate = useNavigate();
  const { chainStore, accountStore, queriesStore, analyticsStore, priceStore } =
    useStore();
  const account = accountStore.getAccount(chainStore.current.chainId);

  const sendConfigs = useUndelegateTxConfig(
    chainStore,
    queriesStore,
    accountStore,
    chainStore.current.chainId,
    account.bech32Address,
    validatorAddress
  );
  const { amountConfig, memoConfig, feeConfig } = sendConfigs;

  const [isToggleClicked, setIsToggleClicked] = useState<boolean>(false);
  const [inputInUsd, setInputInUsd] = useState<string | undefined>("");

  const intl = useIntl();
  const error = amountConfig.error;

  const stakedAmount = queriesStore
    .get(amountConfig.chainId)
    .cosmos.queryDelegations.getQueryBech32Address(amountConfig.sender)
    .getDelegationTo(validatorAddress);

  const convertToUsd = (currency: any) => {
    const value = priceStore.calculatePrice(currency);
    return value && value.shrink(true).maxDecimals(6).toString();
  };

  const queryBalances = queriesStore
    .get(sendConfigs.amountConfig.chainId)
    .queryBalances.getQueryBech32Address(sendConfigs.amountConfig.sender);

  const queryBalance = queryBalances.balances.find(
    (bal) =>
      sendConfigs.amountConfig.sendCurrency.coinMinimalDenom ===
      bal.currency.coinMinimalDenom
  );
  const balance = queryBalance
    ? queryBalance.balance
    : new CoinPretty(sendConfigs.amountConfig.sendCurrency, new Int(0));

  useEffect(() => {
    const inputValueInUsd = convertToUsd(balance);
    setInputInUsd(inputValueInUsd);
  }, [sendConfigs.amountConfig.amount]);

  const Usd = inputInUsd
    ? ` (${inputInUsd} ${priceStore.defaultVsCurrency.toUpperCase()})`
    : "";

  const availableBalance = `${balance
    .trim(true)
    .shrink(true)
    .maxDecimals(6)
    .toString()}${Usd}`;

  const errorText: string | undefined = useMemo(() => {
    if (error) {
      switch (error.constructor) {
        case EmptyAmountError:
          // No need to show the error to user.
          return;
        case InvalidNumberAmountError:
          return intl.formatMessage({
            id: "input.amount.error.invalid-number",
          });
        case ZeroAmountError:
          return intl.formatMessage({
            id: "input.amount.error.is-zero",
          });
        case NegativeAmountError:
          return intl.formatMessage({
            id: "input.amount.error.is-negative",
          });
        case InsufficientAmountError:
          return intl.formatMessage({
            id: "input.amount.error.insufficient",
          });
        default:
          return intl.formatMessage({ id: "input.amount.error.unknown" });
      }
    }
  }, [intl, error]);

  const notification = useNotification();

  const txnResult = {
    onBroadcasted: () => {
      notification.push({
        type: "primary",
        placement: "top-center",
        duration: 2,
        content: `Transaction broadcasted`,
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });

      analyticsStore.logEvent("Unstake tx broadcasted", {
        chainId: chainStore.current.chainId,
        chainName: chainStore.current.chainName,
      });
    },
    onFulfill: (tx: any) => {
      const istxnSuccess = tx.code ? false : true;
      notification.push({
        type: istxnSuccess ? "success" : "danger",
        placement: "top-center",
        duration: 5,
        content: istxnSuccess
          ? `Transaction Completed`
          : `Transaction Failed: ${tx.log}`,
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });
    },
  };

  const unstakeClicked = async () => {
    try {
      await account.cosmos
        .makeUndelegateTx(amountConfig.amount, validatorAddress)
        .send(feeConfig.toStdFee(), memoConfig.memo, undefined, txnResult);
    } catch (e) {
      notification.push({
        type: "danger",
        placement: "top-center",
        duration: 5,
        content: `Transaction Failed`,
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });
    } finally {
      navigate("/", { replace: true });
    }
  };

  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={`Unstake`}
      showBottomMenu={false}
      onBackButton={() => navigate(-1)}
    >
      <FormGroup style={{ borderRadius: "0%", marginBottom: "2px" }}>
        <div className={style["unstake-container"]}>
          <div className={style["current-stake"]}>
            <div
              style={{
                color: "rgba(255,255,255,0.6)",
                fontSize: "14px",
                fontWeight: 400,
                lineHeight: "17.5px",
              }}
            >
              Current staked amount
            </div>
            <div
              className={style["value"]}
              style={{ fontWeight: 500, lineHeight: "17.5px" }}
            >
              {stakedAmount.maxDecimals(4).trim(true).toString()}
            </div>
          </div>

          <div>
            <StakeInput
              label="Amount"
              amountConfig={sendConfigs.amountConfig}
              isToggleClicked={isToggleClicked}
            />

            <div
              style={{
                fontSize: "12px",
                fontWeight: 400,
                color: "rgba(255,255,255,0.6)",
                marginTop: "8px",
              }}
            >
              {`Available: ${availableBalance}`}
            </div>

            <UseMaxButton
              amountConfig={sendConfigs.amountConfig}
              isToggleClicked={isToggleClicked}
              setIsToggleClicked={setIsToggleClicked}
            />

            <MemoInput memoConfig={sendConfigs.memoConfig} />
          </div>
          <Alert className={style["alert"]}>
            <img src={require("@assets/svg/wireframe/alert.svg")} alt="" />
            <div>
              <p className={style["lightText"]}>
                When you decide to unstake, your assets will be locked for 21
                days to be liquid again
              </p>
            </div>
          </Alert>

          <FeeButtons
            label="Fee"
            gasLabel="gas"
            feeConfig={sendConfigs.feeConfig}
            gasConfig={sendConfigs.gasConfig}
            priceStore={priceStore}
          />
          <ButtonV2
            text=""
            styleProps={{
              width: "336px",
              padding: "12px",
              height: "56px",
              margin: "0 auto",
              position: "fixed",
              bottom: "15px",
              left: "0px",
              right: "0px",
            }}
            disabled={
              errorText != null ||
              !amountConfig.amount ||
              account.txTypeInProgress === TXNTYPE.undelegate
            }
            onClick={() => {
              if (account.txTypeInProgress === TXNTYPE.undelegate) return;
              unstakeClicked();
            }}
            btnBgEnabled={true}
          >
            Confirm
            {account.txTypeInProgress === TXNTYPE.undelegate && (
              <i className="fas fa-spinner fa-spin ml-2 mr-2" />
            )}
          </ButtonV2>
        </div>
      </FormGroup>
    </HeaderLayout>
  );
});
