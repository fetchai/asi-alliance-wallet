import { GlassCard } from "@components-v2/glass-card";
import React, { useMemo } from "react";
import styles from "./style.module.scss";
import { observer } from "mobx-react-lite";
import { Staking } from "@keplr-wallet/stores";
import { useStore } from "../../../../stores";
import { useNavigate } from "react-router";
import { Dec } from "@keplr-wallet/unit";
import { useLanguage } from "../../../../languages";

export const MyValidator = observer(() => {
  const { chainStore, accountStore, queriesStore, priceStore, analyticsStore } =
    useStore();
  const language = useLanguage();

  const fiatCurrency = language.fiatCurrency;

  const navigate = useNavigate();

  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);

  const queryDelegations =
    queries.cosmos.queryDelegations.getQueryBech32Address(
      account.bech32Address
    );
  const delegations = queryDelegations.delegations;

  const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Bonded
  );
  const unbondingValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonding
  );
  const unbondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonded
  );

  const validators = useMemo(() => {
    return bondedValidators.validators
      .concat(unbondingValidators.validators)
      .concat(unbondedValidators.validators);
  }, [
    bondedValidators.validators,
    unbondingValidators.validators,
    unbondedValidators.validators,
  ]);

  const validatorsMap = useMemo(() => {
    const map: Map<string, Staking.Validator> = new Map();

    for (const val of validators) {
      map.set(val.operator_address, val);
    }

    return map;
  }, [validators]);
  return (
    <React.Fragment>
      {delegations.length > 0 ? (
        delegations.map((del) => {
          const val = validatorsMap.get(del.delegation.validator_address);
          if (!val) {
            return null;
          }

          const thumbnail =
            bondedValidators.getValidatorThumbnail(val.operator_address) ||
            unbondingValidators.getValidatorThumbnail(val.operator_address) ||
            unbondedValidators.getValidatorThumbnail(val.operator_address);

          const amount = queryDelegations.getDelegationTo(val.operator_address);
          const amountFiatCurrency = priceStore.calculatePrice(
            amount.maxDecimals(5).trim(true).shrink(true),
            fiatCurrency
          );

          const reward = queries.cosmos.queryRewards
            .getQueryBech32Address(account.bech32Address)
            .getStakableRewardOf(val.operator_address);

          const inflation = queries.cosmos.queryInflation;
          const { inflation: ARR } = inflation;
          const validatorCom: any = parseFloat(
            val?.commission.commission_rates.rate || "0"
          );
          const APR = ARR.mul(new Dec(1 - validatorCom));
          return (
            <GlassCard
              styleProps={{
                cursor: "pointer",
              }}
              onClick={() => {
                analyticsStore.logEvent("stake_validator_click", {
                  pageName: "Stake",
                });
                navigate(`/validator/${del.delegation.validator_address}`, {
                  state: { previousAddress: "stake" },
                });
              }}
              key={del.delegation.validator_address}
            >
              <div className={styles["validator-div"]}>
                {thumbnail ? (
                  <img src={thumbnail} alt={"validator"} />
                ) : (
                  <div className={styles["validator-avatar"]}>
                    {val.description.moniker?.toString()[0].toUpperCase()}
                  </div>
                )}

                <div className={styles["validator-details"]}>
                  <div className={styles["validator-top"]}>
                    <div className={styles["left-col"]}>
                      <div style={{ fontWeight: 400 }}>
                        {val.description.moniker?.trim()}
                      </div>
                      <div>
                        <span
                          className={styles["validator-currency"]}
                          style={{ color: "var(--font-secondary)" }}
                        >
                          {amount
                            .maxDecimals(4)
                            .trim(true)
                            .shrink(true)
                            .toString()}
                        </span>
                      </div>
                    </div>

                    {amountFiatCurrency && (
                      <div className={styles["right-col"]}>
                        <span className={styles["amount"]}>
                          {amountFiatCurrency
                            .shrink(true)
                            .maxDecimals(6)
                            .trim(true)
                            .toString()}
                        </span>
                        <span
                          className={styles["validator-currency"]}
                          style={{ color: "var(--font-secondary)" }}
                        >
                          {" "}
                          {fiatCurrency.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* for line */}
                  <div
                    style={{
                      width: "100%",
                      height: "1px",
                      background: "var(--bg-grey-dark)",
                    }}
                  />

                  <div className={styles["validator-bottom"]}>
                    <div className={styles["left-col"]}>
                      <div>
                        <span className={styles["validator-currency"]}>
                          {`${APR.maxDecimals(2).trim(true).toString()}% APR`}
                        </span>
                      </div>
                    </div>

                    <div
                      className={styles["right-col"]}
                      style={{
                        fontSize: "12px",
                        fontWeight: 400,
                      }}
                    >
                      <span className={styles["validator-reward"]}>
                        {reward
                          .maxDecimals(2)
                          .trim(true)
                          .shrink(true)
                          .toString()}
                      </span>
                      <span
                        style={{
                          marginLeft: "5px",
                          fontSize: "12px",
                          color: "var(--font-secondary)",
                        }}
                      >
                        Earned
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          );
        })
      ) : (
        <div>No validators yet!</div>
      )}
    </React.Fragment>
  );
});
