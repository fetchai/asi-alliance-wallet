import { ButtonV2 } from "@components-v2/buttons/button";
import React, { FunctionComponent, useMemo, useState } from "react";
import style from "./style.module.scss";

import { GlassCard } from "@components-v2/glass-card";
import { useNotification } from "@components/notification";
import {
  AccountSetBase,
  CosmosAccount,
  CosmwasmAccount,
  EthereumAccount,
  ObservableQueryRewardsInner,
  SecretAccount,
  Staking,
} from "@keplr-wallet/stores";
import { useNavigate } from "react-router";
import { DefaultGasMsgWithdrawRewards } from "../../../../config.ui";
import { useStore } from "../../../../stores";
import { MyValidator } from "./my-validator";
import { observer } from "mobx-react-lite";
import { separateNumericAndDenom } from "@utils/format";
import { Dec } from "@keplr-wallet/unit";
import { TXNTYPE } from "../../../../config";
import { useDropdown } from "@components-v2/dropdown/dropdown-context";
import { useLanguage } from "../../../../languages";
import { navigateOnTxnEvents } from "@utils/navigate-txn-event";

export const MyStakes = observer(
  ({
    rewards,
    accountInfo,
  }: {
    rewards: ObservableQueryRewardsInner;
    accountInfo: AccountSetBase &
      CosmosAccount &
      CosmwasmAccount &
      SecretAccount &
      EthereumAccount;
  }) => {
    const navigate = useNavigate();
    const notification = useNotification();
    const language = useLanguage();

    const fiatCurrency = language.fiatCurrency;

    const [isWithdrawingRewards, setIsWithdrawingRewards] = useState(false);
    const {
      chainStore,
      analyticsStore,
      accountStore,
      priceStore,
      queriesStore,
      activityStore,
    } = useStore();

    const account = accountStore.getAccount(chainStore.current.chainId);
    const queries = queriesStore.get(chainStore.current.chainId);

    const { setIsDropdownOpen } = useDropdown();

    const queryDelegations =
      queries.cosmos.queryDelegations.getQueryBech32Address(
        account.bech32Address
      );
    const delegations = queryDelegations.delegations.filter((del) =>
      new Dec(del.balance.amount).gt(new Dec(0))
    );

    const queryReward = queries.cosmos.queryRewards.getQueryBech32Address(
      account.bech32Address
    );
    const queryStakable = queries.queryBalances.getQueryBech32Address(
      account.bech32Address
    ).stakable;
    const stakable = queryStakable.balance;

    const pendingStakableReward =
      queries.cosmos.queryRewards.getQueryBech32Address(
        account.bech32Address
      ).stakableReward;

    const pendingStakableRewardUSD = priceStore.calculatePrice(
      pendingStakableReward.shrink(true).maxDecimals(6).trim(true),
      fiatCurrency
    );

    const { numericPart: totalNumber } = separateNumericAndDenom(
      pendingStakableReward.shrink(true).maxDecimals(6).trim(true).toString()
    );

    const handleClaimRewards = async () => {
      if (accountInfo.isReadyToSendTx) {
        try {
          setIsWithdrawingRewards(true);

          // When the user delegated too many validators,
          // it can't be sent to withdraw rewards from all validators due to the block gas limit.
          // So, to prevent this problem, just send the msgs up to 8.
          const validatorAddresses =
            rewards.getDescendingPendingRewardValidatorAddresses(8);
          const tx =
            accountInfo.cosmos.makeWithdrawDelegationRewardTx(
              validatorAddresses
            );

          let gas: number;
          try {
            analyticsStore.logEvent("claim_all_staking_reward_click", {
              pageName: "Stake",
            });
            // Gas adjustment is 1.5
            // Since there is currently no convenient way to adjust the gas adjustment on the UI,
            // Use high gas adjustment to prevent failure.
            gas = (await tx.simulate()).gasUsed * 1.5;
          } catch (e) {
            console.log(e);

            gas = DefaultGasMsgWithdrawRewards * validatorAddresses.length;
          }

          await tx.send(
            {
              amount: [],
              gas: gas.toString(),
            },
            "",
            undefined,
            {
              onBroadcasted: () => {
                analyticsStore.logEvent("claim_txn_broadcasted", {
                  chainId: chainStore.current.chainId,
                  chainName: chainStore.current.chainName,
                  pageName: "Stake",
                });
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
        } catch (e) {
          const txnNavigationOptions = {
            redirect: () => {
              navigate("/stake", { replace: true });
            },
            txType: TXNTYPE.withdrawRewards,
            txInProgress: account.txInProgress,
          };
          navigateOnTxnEvents(txnNavigationOptions);
          notification.push({
            type: "warning",
            placement: "top-center",
            duration: 5,
            content: `Fail to withdraw rewards: ${e.message}`,
            canDelete: true,
            transition: {
              duration: 0.25,
            },
          });
          analyticsStore.logEvent("claim_txn_broadcasted_fail", {
            chainId: chainStore.current.chainId,
            chainName: chainStore.current.chainName,
            pageName: "Stake",
          });
        } finally {
          setIsWithdrawingRewards(false);

          const txnNavigationOptions = {
            redirect: () => {
              navigate("/activity", { replace: true });
            },
            txType: TXNTYPE.withdrawRewards,
            txInProgress: account.txInProgress,
          };
          setTimeout(() => {
            navigateOnTxnEvents(txnNavigationOptions);
          }, 200);

          setIsDropdownOpen(false);
        }
      }
    };

    const [showReward, setShowRegard] = useState<boolean>(false);

    return (
      <div className={style["row"]}>
        <ButtonV2
          variant="light"
          text="Stake more"
          onClick={() => {
            analyticsStore.logEvent("stake_click", {
              chainId: chainStore.current.chainId,
              chainName: chainStore.current.chainName,
              pageName: "Stake",
            });
            navigate("/validator/validator-list");
          }}
          styleProps={{
            height: "44px",
            marginTop: "32px",
            marginBottom: "32px",
            backgroundColor: "#B1FCAB",
          }}
        />

        {/* Claim Rewards */}
        <GlassCard>
          <div className={style["reward-row"]}>
            <div className={style["reward-col"]}>
              <div className={style["left-col"]}>
                <span className={style["label"]}>Staking rewards</span>
                <span className={style["total-rewards"]}>
                  {pendingStakableRewardUSD
                    ? pendingStakableRewardUSD
                        .shrink(true)
                        .maxDecimals(6)
                        .trim(true)
                        .toString()
                    : totalNumber}{" "}
                  <span>{fiatCurrency.toUpperCase()}</span>
                </span>
              </div>

              {!(
                !account.isReadyToSendTx ||
                pendingStakableReward.toDec().equals(new Dec(0)) ||
                stakable.toDec().lte(new Dec(0)) ||
                queryReward.pendingRewardValidatorAddresses.length === 0
              ) && (
                <ButtonV2
                  variant="light"
                  styleProps={{
                    width: "91px",
                    padding: "2px 15px",
                    height: "36px",
                    marginTop: "0",
                    fontSize: "14px",
                    backgroundColor: "#B1FCAB",
                  }}
                  disabled={
                    activityStore.getPendingTxnTypes[TXNTYPE.withdrawRewards] ||
                    isWithdrawingRewards
                  }
                  text={
                    activityStore.getPendingTxnTypes[TXNTYPE.withdrawRewards] ||
                    isWithdrawingRewards
                      ? ""
                      : "Claim all"
                  }
                  onClick={() => {
                    if (
                      activityStore.getPendingTxnTypes[
                        TXNTYPE.withdrawRewards
                      ] ||
                      isWithdrawingRewards
                    )
                      return;
                    handleClaimRewards();
                  }}
                >
                  {(activityStore.getPendingTxnTypes[TXNTYPE.withdrawRewards] ||
                    isWithdrawingRewards) && (
                    <i className="fas fa-spinner fa-spin ml-2 mr-2" />
                  )}
                </ButtonV2>
              )}
            </div>

            {!(
              pendingStakableReward.toDec().equals(new Dec(0)) ||
              stakable.toDec().lte(new Dec(0)) ||
              queryReward.pendingRewardValidatorAddresses.length === 0 ||
              delegations.length === 0
            ) && (
              <div
                onClick={() => setShowRegard((prev) => !prev)}
                style={{
                  cursor: "pointer",
                }}
              >
                <span className={style["rewards-toggle"]}>
                  {showReward ? "Hide" : "View"} rewards
                </span>
                {showReward ? (
                  <img
                    src={require("@assets/svg/chevron-up.svg")}
                    alt="up icon"
                  />
                ) : (
                  <img
                    src={require("@assets/svg/wireframe/chevron-down-rewards.svg")}
                    alt="down icon"
                  />
                )}
              </div>
            )}

            {showReward && (
              <div className={style["show-rewards"]}>
                <DelegateReward />
              </div>
            )}
          </div>
        </GlassCard>

        <MyValidator />
      </div>
    );
  }
);

const DelegateReward: FunctionComponent = observer(() => {
  const {
    chainStore,
    accountStore,
    queriesStore,
    activityStore,
    analyticsStore,
  } = useStore();

  const navigate = useNavigate();

  const notification = useNotification();
  const [_isWithdrawingRewards, setIsWithdrawingRewards] = useState(false);

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

  const handleClaim = async (validatorAddress: string) => {
    setIsWithdrawingRewards(true);
    try {
      analyticsStore.logEvent("claim_click", {
        pageName: "Stake",
      });
      await account.cosmos.sendWithdrawDelegationRewardMsgs(
        [validatorAddress],
        "",
        undefined,
        undefined,
        {
          onBroadcasted() {
            analyticsStore.logEvent("claim_txn_broadcasted", {
              chainId: chainStore.current.chainId,
              chainName: chainStore.current.chainName,
              pageName: "Stake",
            });
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
    } catch (err) {
      console.error(err);
      analyticsStore.logEvent("claim_txn_broadcasted_fail", {
        chainId: chainStore.current.chainId,
        chainName: chainStore.current.chainName,
        pageName: "Stake",
      });
      if (err.toString().includes("Error: Request rejected")) {
        navigate(`/validators/${validatorAddress}`);
      }
    } finally {
      setIsWithdrawingRewards(false);
      const txnNavigationOptions = {
        redirect: () => {
          navigate("/stake");
        },
        txType: TXNTYPE.withdrawRewards,
        txInProgress: account.txInProgress,
      };
      navigateOnTxnEvents(txnNavigationOptions);
    }
  };

  return (
    <React.Fragment>
      {delegations.map((del) => {
        const val = validatorsMap.get(del.delegation.validator_address);
        if (!val) {
          return null;
        }

        const thumbnail =
          bondedValidators.getValidatorThumbnail(val.operator_address) ||
          unbondingValidators.getValidatorThumbnail(val.operator_address) ||
          unbondedValidators.getValidatorThumbnail(val.operator_address);

        // const amount = queryDelegations.getDelegationTo(val.operator_address);
        // const amountUSD = priceStore.calculatePrice(
        //   amount.maxDecimals(5).trim(true).shrink(true)
        // );
        const rewards = queries.cosmos.queryRewards
          .getQueryBech32Address(account.bech32Address)
          .getStakableRewardOf(val.operator_address);

        return parseFloat(rewards.toString().split(" ")[0]) > 0 ? (
          <div
            key={del.delegation.validator_address}
            className={style["reward-container"]}
          >
            {thumbnail ? (
              <img src={thumbnail} alt={"validator"} />
            ) : (
              <div className={style["validator-avatar"]}>
                {val.description.moniker?.toString()[0].toUpperCase()}
              </div>
            )}

            <div className={style["reward-data"]}>
              <div className={style["reward-title"]}>
                {val.description.moniker?.trim()}
              </div>
              <div className={style["reward-amount"]}>
                {rewards.maxDecimals(4).trim(true).shrink(true).toString()}
              </div>
            </div>
            <ButtonV2
              variant="light"
              styleProps={{
                width: "71px",
                padding: "2px 15px",
                height: "36px",
                marginTop: "0",
                fontSize: "14px",
                backgroundColor: "var(--bg-green-base)",
              }}
              disabled={
                activityStore.getPendingTxnTypes[TXNTYPE.withdrawRewards]
              }
              text={
                activityStore.getPendingTxnTypes[TXNTYPE.withdrawRewards]
                  ? ""
                  : "Claim"
              }
              onClick={() => {
                if (activityStore.getPendingTxnTypes[TXNTYPE.withdrawRewards])
                  return;
                handleClaim(val.operator_address);
              }}
            >
              {activityStore.getPendingTxnTypes[TXNTYPE.withdrawRewards] && (
                <i className="fas fa-spinner fa-spin ml-2 mr-2" />
              )}
            </ButtonV2>
          </div>
        ) : null;
      })}
    </React.Fragment>
  );
});
