import { ButtonV2 } from "@components-v2/buttons/button";
import { UseMaxButton } from "@components-v2/buttons/use-max-button";
import { MemoInput } from "@components-v2/form";
import { StakeInput } from "@components-v2/form/stake-input";
import { ValidatorCardV2 } from "@components-v2/validator-card";
import { useNotification } from "@components/notification";
import { useDelegateTxConfig } from "@keplr-wallet/hooks";
import { Staking } from "@keplr-wallet/stores";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { useLocation, useNavigate } from "react-router";
import { Alert, FormGroup } from "reactstrap";
import { TXNTYPE } from "../../../config";
import { useStore } from "../../../stores";
import { useLanguage } from "../../../languages";
import style from "./style.module.scss";
import { navigateOnTxnEvents } from "@utils/navigate-txn-event";

export const Delegate: FunctionComponent = observer(() => {
  const location = useLocation();
  const validatorAddress = location.pathname.split("/")[2];

  const navigate = useNavigate();
  const language = useLanguage();
  const fiatCurrency = language.fiatCurrency;

  const {
    chainStore,
    accountStore,
    queriesStore,
    analyticsStore,
    priceStore,
    activityStore,
  } = useStore();

  const [isToggleClicked, setIsToggleClicked] = useState<boolean>(false);

  const [inputInFiatCurrency, setInputInFiatCurrency] = useState<
    string | undefined
  >("");

  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);

  const sendConfigs = useDelegateTxConfig(
    chainStore,
    queriesStore,
    accountStore,
    chainStore.current.chainId,
    account.bech32Address
  );

  useEffect(() => {
    sendConfigs.recipientConfig.setRawRecipient(validatorAddress);
  }, [sendConfigs.recipientConfig, validatorAddress]);

  const sendConfigError =
    sendConfigs.recipientConfig.error ??
    sendConfigs.amountConfig.error ??
    sendConfigs.memoConfig.error ??
    sendConfigs.gasConfig.error ??
    sendConfigs.feeConfig.error;
  const txStateIsValid = sendConfigError == null;

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

  const convertToUsd = (currency: any) => {
    const value = priceStore.calculatePrice(currency, fiatCurrency);
    return value && value.shrink(true).maxDecimals(6).toString();
  };
  useEffect(() => {
    const inputValueInUsd = convertToUsd(balance);
    setInputInFiatCurrency(inputValueInUsd);
  }, [sendConfigs.amountConfig.amount]);

  const FiatCurrency = inputInFiatCurrency
    ? ` (${inputInFiatCurrency} ${fiatCurrency.toUpperCase()})`
    : "";

  const availableBalance = `${balance
    .trim(true)
    .shrink(true)
    .maxDecimals(6)
    .toString()}${FiatCurrency}`;

  const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Bonded
  );

  const unbondingValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonding
  );
  const unbondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonded
  );

  const validator =
    bondedValidators.getValidator(validatorAddress) ||
    unbondingValidators.getValidator(validatorAddress) ||
    unbondedValidators.getValidator(validatorAddress);

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
      analyticsStore.logEvent("stake_txn_broadcasted", {
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
  const stakeClicked = async () => {
    try {
      analyticsStore.logEvent("stake_txn_click", { pageName: "Stake" });
      await account.cosmos
        .makeDelegateTx(sendConfigs.amountConfig.amount, validatorAddress)
        .send(
          sendConfigs.feeConfig.toStdFee(),
          sendConfigs.memoConfig.memo,
          undefined,
          txnResult
        );
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
      analyticsStore.logEvent("stake_txn_broadcasted_fail", {
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
        txType: TXNTYPE.delegate,
        txInProgress: account.txInProgress,
      };

      setTimeout(() => {
        navigateOnTxnEvents(txnNavigationOptions);
      }, 200);
    }
  };

  const intl = useIntl();

  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={`Stake`}
      showBottomMenu={false}
      onBackButton={() => navigate(-1)}
    >
      {validator && (
        <div style={{ color: "#151A1A", paddingBottom: "48px" }}>
          <ValidatorCardV2 validator={validator} />

          <FormGroup
            style={{
              borderRadius: "0%",
              marginBottom: "2px",
              marginTop: "16px",
            }}
          >
            <StakeInput
              label="Amount"
              amountConfig={sendConfigs.amountConfig}
              availableBalance={availableBalance}
              isToggleClicked={isToggleClicked}
            />

            <UseMaxButton
              amountConfig={sendConfigs.amountConfig}
              isToggleClicked={isToggleClicked}
              setIsToggleClicked={setIsToggleClicked}
            />

            <MemoInput memoConfig={sendConfigs.memoConfig} />

            <Alert className={style["alert"]}>
              <img src={require("@assets/svg/wireframe/alert.svg")} alt="" />
              <div>
                <p className={style["lightText"]}>
                  {intl.formatMessage({
                    id: "stake.alert",
                  })}
                </p>
              </div>
            </Alert>
            <ButtonV2
              text=""
              variant="dark"
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
                !account.isReadyToSendTx ||
                !txStateIsValid ||
                activityStore.getPendingTxnTypes[TXNTYPE.delegate]
              }
              onClick={() => {
                if (activityStore.getPendingTxnTypes[TXNTYPE.delegate]) return;
                stakeClicked();
              }}
              btnBgEnabled={true}
            >
              {intl.formatMessage({
                id: "unstake.confirm",
              })}
              {activityStore.getPendingTxnTypes[TXNTYPE.delegate] && (
                <i className="fas fa-spinner fa-spin ml-2 mr-2" />
              )}
            </ButtonV2>
          </FormGroup>
        </div>
      )}
    </HeaderLayout>
  );
});
