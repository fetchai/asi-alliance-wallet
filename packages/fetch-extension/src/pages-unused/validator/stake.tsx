import { ButtonV2 } from "@components-v2/buttons/button";
import { useNotification } from "@components/notification";
import {
  EmptyAmountError,
  InsufficientAmountError,
  InvalidNumberAmountError,
  NegativeAmountError,
  ZeroAmountError,
  useDelegateTxConfig,
} from "@keplr-wallet/hooks";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useMemo } from "react";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { FormGroup, Input, Label } from "reactstrap";
import { useStore } from "../../stores";
import style from "./style.module.scss";

export const Stake: FunctionComponent<{
  validatorAddress: string;
  isFetching: boolean;
  rewards: any;
  amount: CoinPretty;
}> = observer(({ validatorAddress, isFetching, rewards, amount }) => {
  const navigate = useNavigate();
  const { chainStore, accountStore, queriesStore, analyticsStore } = useStore();
  const account = accountStore.getAccount(chainStore.current.chainId);

  const sendConfigs = useDelegateTxConfig(
    chainStore,
    queriesStore,
    accountStore,
    chainStore.current.chainId,
    account.bech32Address
  );
  const { amountConfig, memoConfig, feeConfig } = sendConfigs;

  const intl = useIntl();
  const error = amountConfig.error;

  const queryBalances = queriesStore
    .get(amountConfig.chainId)
    .queryBalances.getQueryBech32Address(amountConfig.sender);

  const queryBalance = queryBalances.balances.find(
    (bal) =>
      amountConfig.sendCurrency.coinMinimalDenom ===
      bal.currency.coinMinimalDenom
  );
  const balance = queryBalance
    ? queryBalance.balance
    : new CoinPretty(amountConfig.sendCurrency, new Int(0));

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

      analyticsStore.logEvent("Stake tx broadcasted", {
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
  const stakeClicked = async () => {
    try {
      await account.cosmos
        .makeDelegateTx(amountConfig.amount, validatorAddress)
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
  const handleClaim = async () => {
    try {
      await account.cosmos.sendWithdrawDelegationRewardMsgs(
        [validatorAddress],
        "",
        undefined,
        undefined,
        {
          onBroadcasted() {
            notification.push({
              type: "primary",
              placement: "top-center",
              duration: 5,
              content: `Transaction Broadcasted`,
              canDelete: true,
              transition: {
                duration: 0.25,
              },
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
                : `Transaction Failed`,
              canDelete: true,
              transition: {
                duration: 0.25,
              },
            });
          },
        }
      );
      navigate(`/validators/${validatorAddress}/stake`);
    } catch (err) {
      console.error(err);
      if (err.toString().includes("Error: Request rejected")) {
        navigate(`/validators/${validatorAddress}/stake`);
      }
    }
  };
  return (
    <React.Fragment>
      <div className={style["stakedAmount"]}>
        <div>Current Staked Amount</div>
        <div
          style={{
            fontWeight: "bold",
            color: amount.toDec().isPositive() ? "#3b82f6" : "white",
          }}
        >
          {amount.maxDecimals(4).trim(true).toString()}
        </div>
      </div>
      <div className={style["details"]}>
        <div className={style["col"]}>
          <span className={style["label"]}>Earned Rewards</span>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              color: "white",
            }}
          >
            {!isFetching ? (
              <div>
                {!rewards ||
                rewards.length === 0 ||
                parseFloat(
                  rewards[0]?.maxDecimals(4).toString().split(" ")[0]
                ) < 0.00001 ? (
                  <span style={{ color: "white" }}>0</span>
                ) : (
                  rewards[0]?.maxDecimals(4).toString()
                )}
              </div>
            ) : (
              <span style={{ fontSize: "14px" }}>
                <i className="fas fa-spinner fa-spin" />
              </span>
            )}
            {(!rewards ||
              rewards.length !== 0 ||
              parseFloat(rewards[0]?.maxDecimals(4).toString().split(" ")[0]) >
                0.00001) && (
              <button
                color="primary"
                onClick={handleClaim}
                className={style["claimButton"]}
              >
                Claim
              </button>
            )}
          </div>
        </div>
      </div>
      <FormGroup style={{ borderRadius: "0%", marginBottom: "2px" }}>
        <Label className="form-control-label" style={{ width: "100%" }}>
          <div
            className={style["balance"]}
            onClick={(e) => {
              e.preventDefault();
              amountConfig.toggleIsMax();
            }}
          >{`Balance: ${balance.trim(true).maxDecimals(6).toString()}`}</div>
        </Label>
        <Input
          className="form-control-alternative"
          type="number"
          value={amountConfig.amount}
          placeholder="0 FET"
          onChange={(e) => {
            e.preventDefault();
            amountConfig.setAmount(e.target.value);
          }}
          style={{
            color: "white",
            borderRadius: "5px",
            background: "rgba(255,255,255,0.1)",
          }}
          min={0}
          autoComplete="off"
        />
        {errorText != null ? (
          <div className={style["errorText"]}>{errorText}</div>
        ) : null}
        <ButtonV2
          text=""
          disabled={errorText != null || !amountConfig.amount}
          styleProps={{ alignItems: "end", marginTop: "10px" }}
          onClick={stakeClicked}
        >
          Stake
        </ButtonV2>
      </FormGroup>
    </React.Fragment>
  );
});
