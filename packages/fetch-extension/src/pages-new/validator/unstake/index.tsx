import { ButtonV2 } from "@components-v2/buttons/button";
import { UseMaxButton } from "@components-v2/buttons/use-max-button";
import { MemoInput } from "@components-v2/form";
import { StakeInput } from "@components-v2/form/stake-input";
import { useNotification } from "@components/notification";
import {
  EmptyAmountError,
  InsufficientAmountError,
  InvalidNumberAmountError,
  NegativeAmountError,
  ZeroAmountError,
  useUndelegateTxConfig,
} from "@keplr-wallet/hooks";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { observer } from "mobx-react-lite";
import React, { useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { useLocation, useNavigate } from "react-router";
import { Alert, FormGroup } from "reactstrap";
import { TXNTYPE } from "../../../config";
import { useStore } from "../../../stores";
import style from "./style.module.scss";
import { useLanguage } from "../../../languages";
import { navigateOnTxnEvents } from "@utils/navigate-txn-event";
import { Staking } from "@keplr-wallet/stores";

export const Unstake = observer(() => {
  const location = useLocation();
  const validatorAddress = location.pathname.split("/")[2];
  const language = useLanguage();
  const fiatCurrency = language.fiatCurrency;
  const navigate = useNavigate();
  const {
    chainStore,
    accountStore,
    queriesStore,
    analyticsStore,
    priceStore,
    activityStore,
  } = useStore();
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
  const [inputInFiatCurrency, setInputInFiatCurrency] = useState<
    string | undefined
  >("");

  const intl = useIntl();
  const error = amountConfig.error;

  const stakedAmount = queriesStore
    .get(amountConfig.chainId)
    .cosmos.queryDelegations.getQueryBech32Address(amountConfig.sender)
    .getDelegationTo(validatorAddress);

  const convertToUsd = (currency: any) => {
    const value = priceStore.calculatePrice(currency, fiatCurrency);
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
    setInputInFiatCurrency(inputValueInUsd);
  }, [sendConfigs.amountConfig.amount]);

  const FiatCurrency = inputInFiatCurrency
    ? ` (${inputInFiatCurrency} ${fiatCurrency.toUpperCase()})`
    : "";
  const queries = queriesStore.get(chainStore.current.chainId);
  const availableBalance = `${balance
    .trim(true)
    .shrink(true)
    .maxDecimals(6)
    .toString()}${FiatCurrency}`;
  const validator =
    queries.cosmos.queryValidators
      .getQueryStatus(Staking.BondStatus.Bonded)
      .getValidator(validatorAddress) ||
    queries.cosmos.queryValidators
      .getQueryStatus(Staking.BondStatus.Unbonding)
      .getValidator(validatorAddress) ||
    queries.cosmos.queryValidators
      .getQueryStatus(Staking.BondStatus.Unbonded)
      .getValidator(validatorAddress);

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
      analyticsStore.logEvent("unstake_txn_broadcasted", {
        chainId: chainStore.current.chainId,
        chainName: chainStore.current.chainName,
        validatorName: validator?.description.moniker,
        feeType: sendConfigs.feeConfig.feeType,
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
      analyticsStore.logEvent("unstake_txn_click", {
        pageName: "Stake Validator",
      });
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
      analyticsStore.logEvent("unstake_txn_broadcasted_fail", {
        chainId: chainStore.current.chainId,
        chainName: chainStore.current.chainName,
        feeType: sendConfigs.feeConfig.feeType,
        message: e?.message ?? "",
      });
    } finally {
      const txnNavigationOptions = {
        redirect: () => {
          navigate("/activity", { replace: true });
        },
        txType: TXNTYPE.undelegate,
        txInProgress: account.txInProgress,
      };
      setTimeout(() => {
        navigateOnTxnEvents(txnNavigationOptions);
      }, 200);
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
      <FormGroup
        style={{
          borderRadius: "0%",
          marginBottom: "2px",
          paddingBottom: "48px",
        }}
      >
        <div className={style["unstake-container"]}>
          <div className={style["current-stake"]}>
            <div className={style["current-stake-label"]}>
              {intl.formatMessage({
                id: "unstake.current-staked",
              })}
            </div>
            <div className={style["current-stake-value"]}>
              {stakedAmount.maxDecimals(4).trim(true).toString()}
            </div>
          </div>

          <div>
            <StakeInput
              label="Amount"
              amountConfig={sendConfigs.amountConfig}
              isToggleClicked={isToggleClicked}
              availableBalance={availableBalance}
            />

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
                {intl.formatMessage({
                  id: "unstake.alert",
                })}
              </p>
            </div>
          </Alert>
          <ButtonV2
            variant="dark"
            text=""
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
            disabled={
              errorText != null ||
              !amountConfig.amount ||
              activityStore.getPendingTxnTypes[TXNTYPE.undelegate]
            }
            onClick={() => {
              if (activityStore.getPendingTxnTypes[TXNTYPE.undelegate]) return;
              unstakeClicked();
            }}
            btnBgEnabled={true}
          >
            {intl.formatMessage({
              id: "unstake.confirm",
            })}
            {activityStore.getPendingTxnTypes[TXNTYPE.undelegate] && (
              <i className="fas fa-spinner fa-spin ml-2 mr-2" />
            )}
          </ButtonV2>
        </div>
      </FormGroup>
    </HeaderLayout>
  );
});
