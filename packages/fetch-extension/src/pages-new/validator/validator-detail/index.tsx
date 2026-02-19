import React, { useMemo } from "react";
import style from "./style.module.scss";
import { ButtonV2 } from "@components-v2/buttons/button";
import { StakeDetails } from "./stake-details/stake-details";
import { ValidatorData } from "../../../components-v2/validator-data";
import { useNavigate } from "react-router";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { TXNTYPE } from "../../../config";

export const ValidatorDetails = observer(
  ({ validatorAddress }: { validatorAddress: string }) => {
    const navigate = useNavigate();

    const {
      chainStore,
      accountStore,
      queriesStore,
      activityStore,
      analyticsStore,
    } = useStore();
    const account = accountStore.getAccount(chainStore.current.chainId);
    const queries = queriesStore.get(chainStore.current.chainId);

    const queryDelegations =
      queries.cosmos.queryDelegations.getQueryBech32Address(
        account.bech32Address
      );

    const { amount } = useMemo(() => {
      const amount = queryDelegations.getDelegationTo(validatorAddress);
      const unbondings = queries.cosmos.queryUnbondingDelegations
        .getQueryBech32Address(account.bech32Address)
        .unbondingBalances.find(
          (unbonding) => unbonding.validatorAddress === validatorAddress
        );
      return {
        amount: amount,
        unbondings: unbondings,
      };
    }, [queryDelegations, validatorAddress]);

    const parsedStake = parseFloat(amount?.hideDenom(true).toString() || "0");

    function isStake() {
      return amount && parsedStake > 0.00001;
    }

    const hasLowStake = amount && parsedStake > 0 && parsedStake <= 0.00001;

    return (
      <div
        className={style["validator-details-container"]}
        style={{
          display: "flex",
          height: "100%",
        }}
      >
        <div
          style={{
            flex: 1,
          }}
        >
          <ValidatorData validatorAddress={validatorAddress} />
        </div>

        {hasLowStake && (
          <div className={style["alert"]}>
            <div className={style["low-stake-message"]}>
              <p>
                Your staked balance is too low to perform staking actions.
                Please stake additional tokens to enable Unstake, Redelegate, or
                Claim Rewards.
              </p>
            </div>
          </div>
        )}

        {isStake() && <StakeDetails validatorAddress={validatorAddress} />}

        <div className={style["validator-buttons"]}>
          {isStake() && (
            <ButtonV2
              variant="light"
              styleProps={{
                height: "56px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: "0px",
              }}
              disabled={activityStore.getPendingTxnTypes[TXNTYPE.redelegate]}
              text="Redelegate"
              onClick={() => {
                analyticsStore.logEvent("redelegate_click", {
                  pageName: "Validator Details",
                });
                if (activityStore.getPendingTxnTypes[TXNTYPE.redelegate])
                  return;
                navigate(`/validator/${validatorAddress}/redelegate`);
              }}
            >
              {activityStore.getPendingTxnTypes[TXNTYPE.redelegate] && (
                <i className="fas fa-spinner fa-spin ml-2 mr-2" />
              )}
            </ButtonV2>
          )}

          <ButtonV2
            variant="dark"
            styleProps={{
              height: "56px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: "0px",
            }}
            text={`${isStake() ? "Stake" : "Stake with this validator"}`}
            disabled={activityStore.getPendingTxnTypes[TXNTYPE.delegate]}
            onClick={() => {
              if (activityStore.getPendingTxnTypes[TXNTYPE.delegate]) return;
              navigate(`/validator/${validatorAddress}/delegate`);
              analyticsStore.logEvent(
                isStake() ? "stake_more_click" : "stake_with_validator_click",
                {
                  pageName: "Validator Details",
                }
              );
            }}
          >
            {activityStore.getPendingTxnTypes[TXNTYPE.delegate] && (
              <i className="fas fa-spinner fa-spin ml-2 mr-2" />
            )}
          </ButtonV2>
        </div>

        {/* {amount &&
          parseFloat(
            amount?.maxDecimals(4).trim(true).toString().split(" ")[0]
          ) > 0.00001 && (
            <div
              style={{
                height: "35px",
                padding: "35px",
              }}
            />
          )} */}
      </div>
    );
  }
);
