import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";
import { useNotification } from "@components/notification";
import {
  EmptyAmountError,
  InsufficientAmountError,
  InvalidNumberAmountError,
  NegativeAmountError,
  ZeroAmountError,
  useRedelegateTxConfig,
} from "@keplr-wallet/hooks";
import { Staking } from "@keplr-wallet/stores";
import { CoinPretty } from "@keplr-wallet/unit";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { FormGroup, Input, Label } from "reactstrap";
import { useStore } from "../../stores";
import style from "./style.module.scss";

export const Transfer: FunctionComponent<{
  validatorAddress: string;
  validatorsList: Staking.Validator[];
  balance: CoinPretty;
}> = observer(({ validatorAddress, validatorsList, balance }) => {
  const navigate = useNavigate();
  const { chainStore, accountStore, queriesStore, analyticsStore } = useStore();
  const account = accountStore.getAccount(chainStore.current.chainId);
  const [selectedValidator, setSelectedValidator] = useState<Staking.Validator>(
    validatorsList[0]
  );
  console.log(validatorsList);
  const [showDropdown, setShowDropdown] = useState(false);
  const sendConfigs = useRedelegateTxConfig(
    chainStore,
    queriesStore,
    accountStore,
    chainStore.current.chainId,
    account.bech32Address,
    validatorAddress
  );
  const { amountConfig, memoConfig, feeConfig } = sendConfigs;

  const intl = useIntl();
  const error = amountConfig.error;

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

      analyticsStore.logEvent("Redelegate tx broadcasted", {
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
        .makeBeginRedelegateTx(
          amountConfig.amount,
          validatorAddress,
          selectedValidator.operator_address
        )
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
  const toggleDropdown = () => {
    setShowDropdown(!showDropdown);
  };
  return (
    <React.Fragment>
      <FormGroup style={{ borderRadius: "0%", marginBottom: "2px" }}>
        <div className={style["selectValidator"]} onClick={toggleDropdown}>
          {selectedValidator
            ? selectedValidator.description.moniker
            : "Select Validator"}{" "}
          <img src={require("@assets/svg/wireframe/chevron-down.svg")} alt="" />
        </div>

        <Dropdown
          closeClicked={() => setShowDropdown(false)}
          title="Select Validator"
          isOpen={showDropdown}
          setIsOpen={setShowDropdown}
        >
          <div style={{ height: "400px", overflowY: "scroll", color: "white" }}>
            {validatorsList.map((validator) => {
              return (
                <Card
                  key={validator.operator_address}
                  onClick={() => {
                    setSelectedValidator(validator);
                    setShowDropdown(false);
                  }}
                  heading={validator.description.moniker}
                />
              );
            })}
          </div>
        </Dropdown>
        <Label
          className="form-control-label"
          style={{ width: "100%", marginTop: "10px" }}
        >
          <div
            className={style["balance"]}
            onClick={(e) => {
              e.preventDefault();

              amountConfig.toggleIsMax();
            }}
          >{`Staked: ${balance.trim(true).maxDecimals(6).toString()}`}</div>
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
          Redelegate
        </ButtonV2>
      </FormGroup>
    </React.Fragment>
  );
});
