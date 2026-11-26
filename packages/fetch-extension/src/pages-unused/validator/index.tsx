import { Staking } from "@keplr-wallet/stores";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { useStore } from "../../stores";
import { Stake } from "./stake";
import style from "./style.module.scss";
import { Transfer } from "./transfer";
import { Unstake } from "./unstake";
import { ValidatorDetails } from "./validator-details";
import { Dec } from "@keplr-wallet/unit";
import styleTab from "../validator-list/style.module.scss";
enum ValidatorOperation {
  STAKE = "stake",
  UNSTAKE = "unstake",
  TRANSFER = "transfer",
}

export const Validator: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const validatorAddress = location.pathname.split("/")[2];
  const operation = location.pathname.split("/")[3];
  const validatorTab = localStorage.getItem("validatorTab") || "validator";
  const { chainStore, accountStore, queriesStore } = useStore();
  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);

  const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Bonded
  );
  const unbondingValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonding
  );
  const unbondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonded
  );
  const queryDelegations =
    queries.cosmos.queryDelegations.getQueryBech32Address(
      account.bech32Address
    );
  const queryRewards = queries.cosmos.queryRewards.getQueryBech32Address(
    account.bech32Address
  );
  const { validator, amount, rewards } = useMemo(() => {
    const amount = queryDelegations.getDelegationTo(validatorAddress);
    const validator =
      bondedValidators.getValidator(validatorAddress) ||
      unbondingValidators.getValidator(validatorAddress) ||
      unbondedValidators.getValidator(validatorAddress);
    const thumbnail =
      bondedValidators.getValidatorThumbnail(validatorAddress) ||
      unbondingValidators.getValidatorThumbnail(validatorAddress) ||
      unbondedValidators.getValidatorThumbnail(validatorAddress);
    const rewards = queryRewards.getRewardsOf(validatorAddress);
    return {
      validator,
      thumbnail,
      rewards,
      amount: amount,
    };
  }, [
    queryDelegations,
    validatorAddress,
    bondedValidators,
    unbondingValidators,
    unbondedValidators,
    queryRewards,
  ]);
  const inflation = queries.cosmos.queryInflation;
  const { inflation: ARR, isFetching } = inflation;
  const validatorCom: any = parseFloat(
    validator?.commission.commission_rates.rate || "0"
  );
  const APR = ARR.mul(new Dec(1 - validatorCom));
  return (
    <HeaderLayout
      showTopMenu={true}
      smallTitle={true}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={operation.toLocaleUpperCase()}
      onBackButton={() => navigate(`/validators/${validatorTab}`)}
    >
      <div className={style["stakeContainer"]}>
        <div style={{ gap: 24 }}>
          <div className={styleTab["tabList"]}>
            <div
              className={styleTab["tab"]}
              style={{
                background:
                  operation == ValidatorOperation.STAKE
                    ? "white"
                    : "transparent",
                color:
                  operation == ValidatorOperation.STAKE ? "black" : "white",
              }}
              onClick={() => navigate(`/validators/${validatorAddress}/stake`)}
            >
              Stake
            </div>

            <div
              className={styleTab["tab"]}
              style={{
                background:
                  operation == ValidatorOperation.UNSTAKE
                    ? "white"
                    : "transparent",
                color:
                  operation == ValidatorOperation.UNSTAKE ? "black" : "white",
              }}
              onClick={() =>
                navigate(`/validators/${validatorAddress}/unstake`)
              }
            >
              Unstake
            </div>
            <div
              className={styleTab["tab"]}
              style={{
                background:
                  operation == ValidatorOperation.TRANSFER
                    ? "white"
                    : "transparent",
                color:
                  operation == ValidatorOperation.TRANSFER ? "black" : "white",
              }}
              onClick={() =>
                navigate(`/validators/${validatorAddress}/transfer`)
              }
            >
              Redelegate
            </div>
          </div>
          {operation == ValidatorOperation.STAKE && (
            <Stake
              isFetching={isFetching}
              validatorAddress={validatorAddress}
              rewards={rewards}
              amount={amount}
            />
          )}
          {operation == ValidatorOperation.UNSTAKE && (
            <Unstake validatorAddress={validatorAddress} />
          )}
          {operation == ValidatorOperation.TRANSFER && (
            <Transfer
              validatorAddress={validatorAddress}
              balance={amount}
              validatorsList={[
                ...bondedValidators.validators,
                ...unbondedValidators.validators,
                ...unbondingValidators.validators,
              ].filter(
                (validator) => validator.operator_address != validatorAddress
              )}
            />
          )}
        </div>
        {validator && (
          <ValidatorDetails
            chainID={chainStore.current.chainId}
            validator={validator}
            isFetching={isFetching}
            APR={APR}
          />
        )}
      </div>
    </HeaderLayout>
  );
});
