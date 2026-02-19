import { GlassCard } from "@components-v2/glass-card";
import { Staking } from "@keplr-wallet/stores";
import { formatDistanceToNow } from "date-fns";
import { observer } from "mobx-react-lite";
import React, { useMemo } from "react";
import { useLanguage } from "../../../../languages";
import { useStore } from "../../../../stores";
import styles from "./style.module.scss";

export const MyUnbondingValidators = observer(
  ({ hasDelegations }: { hasDelegations: boolean }) => {
    const { chainStore, accountStore, queriesStore, priceStore } = useStore();

    const account = accountStore.getAccount(chainStore.current.chainId);
    const queries = queriesStore.get(chainStore.current.chainId);
    const language = useLanguage();
    const fiatCurrency = language.fiatCurrency;

    const queryUnbonding =
      queries.cosmos.queryUnbondingDelegations.getQueryBech32Address(
        account.bech32Address
      );

    const unbondings = queryUnbonding.unbondingBalances;

    const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
      Staking.BondStatus.Bonded
    );
    const unbondingValidators = queries.cosmos.queryValidators.getQueryStatus(
      Staking.BondStatus.Unbonding
    );
    const unbondedValidators = queries.cosmos.queryValidators.getQueryStatus(
      Staking.BondStatus.Unbonded
    );

    const validators = useMemo(
      () =>
        bondedValidators.validators
          .concat(unbondingValidators.validators)
          .concat(unbondedValidators.validators),
      [
        bondedValidators.validators,
        unbondingValidators.validators,
        unbondedValidators.validators,
      ]
    );

    const validatorsMap = useMemo(() => {
      const map = new Map<string, Staking.Validator>();
      validators.forEach((v) => map.set(v.operator_address, v));
      return map;
    }, [validators]);

    const unbondingBalancesCount = unbondings?.flatMap(
      (item) => item.entries
    ).length;

    if (unbondings.length === 0 || unbondingBalancesCount === 0) {
      return null;
    }

    return (
      <div
        className={styles["my-validators-container"]}
        style={{
          paddingTop: hasDelegations ? "0px" : "30px",
        }}
      >
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <div
            style={{
              color: "var(--font-dark)",
              fontSize: "16px",
              fontWeight: 400,
            }}
          >
            Unbonding balances
          </div>
          <div className={styles["stake-count"]}>{unbondingBalancesCount}</div>
        </div>

        <div
          className={styles["my-validators-container"]}
          style={{
            paddingBottom: "30px",
          }}
        >
          {unbondings.map((ubd) => {
            const val = validatorsMap.get(ubd.validatorAddress);
            if (!val) return null;

            const thumbnail =
              bondedValidators.getValidatorThumbnail(val.operator_address) ||
              unbondingValidators.getValidatorThumbnail(val.operator_address) ||
              unbondedValidators.getValidatorThumbnail(val.operator_address);

            return (
              <React.Fragment key={ubd.validatorAddress}>
                {ubd.entries.map((entry) => {
                  const remainingTime = formatDistanceToNow(
                    new Date(entry.completionTime),
                    { addSuffix: true }
                  );
                  const amountFiatCurrency = priceStore.calculatePrice(
                    entry?.balance?.maxDecimals(5).trim(true).shrink(true),
                    fiatCurrency
                  );

                  const amount =
                    parseFloat(
                      entry.balance.hideDenom(true).toString() || "0"
                    ) > 0.00001
                      ? entry.balance
                          .maxDecimals(4)
                          .trim(true)
                          .shrink(true)
                          .toString()
                      : `< 0.00001 ${entry?.balance?.denom || ""}`;

                  return (
                    <GlassCard
                      key={`${ubd.validatorAddress}-${entry.completionTime}`}
                    >
                      <div className={styles["validator-div"]}>
                        {thumbnail ? (
                          <img src={thumbnail} alt="validator" />
                        ) : (
                          <div className={styles["validator-avatar"]}>
                            {val.description.moniker?.[0]?.toUpperCase()}
                          </div>
                        )}

                        <div className={styles["validator-details"]}>
                          <div className={styles["validator-top"]}>
                            <div className={styles["left-col"]}>
                              <div style={{ fontWeight: 400 }}>
                                {val.description.moniker}
                              </div>

                              <span
                                className={styles["validator-currency"]}
                                style={{ color: "var(--font-secondary)" }}
                              >
                                {amount}
                              </span>
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

                          <div
                            style={{
                              width: "100%",
                              height: "1px",
                              background: "var(--bg-grey-dark)",
                            }}
                          />

                          <div className={styles["validator-bottom"]}>
                            <span
                              style={{
                                fontSize: "12px",
                                color: "var(--font-secondary)",
                              }}
                            >
                              Unbonding • Completes {remainingTime}
                            </span>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }
);
