import { ButtonV2 } from "@components-v2/buttons/button";
import { GlassCard } from "@components-v2/glass-card/index";
import { useNotification } from "@components/notification";
import { observer } from "mobx-react-lite";
import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useStore } from "../../../../stores";
import style from "../style.module.scss";
import { TXNTYPE } from "../../../../config";

export const StakeDetails = observer(
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
    const location = useLocation();

    const queryDelegations =
      queries.cosmos.queryDelegations.getQueryBech32Address(
        account.bech32Address
      );
    const queryRewards = queries.cosmos.queryRewards.getQueryBech32Address(
      account.bech32Address
    );

    const previousAddress = location.state?.previousAddress || "";

    const amount = queryDelegations.getDelegationTo(validatorAddress);
    const rewards = queryRewards.getRewardsOf(validatorAddress);

    const notification = useNotification();

    const [_isWithdrawingRewards, setIsWithdrawingRewards] = useState(false);
    const current = chainStore.current;
    const accountInfo = accountStore.getAccount(current.chainId);

    const handleClaim = async () => {
      setIsWithdrawingRewards(true);
      try {
        analyticsStore.logEvent("claim_click", {
          pageName: "Validator Details",
        });
        await accountInfo.cosmos.sendWithdrawDelegationRewardMsgs(
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
              analyticsStore.logEvent("claim_txn_broadcasted", {
                chainId: chainStore.current.chainId,
                chainName: chainStore.current.chainName,
                pageName: "Validator Details",
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
        setTimeout(() => {
          navigate("/activity", { replace: true });
        }, 200);
      } catch (err) {
        console.error(err);
        analyticsStore.logEvent("claim_txn_broadcasted_fail", {
          chainId: chainStore.current.chainId,
          chainName: chainStore.current.chainName,
          pageName: "Validator Details",
        });
        if (err.toString().includes("Error: Request rejected")) {
          navigate(`/validator/${validatorAddress}`, {
            state: { previousAddress: previousAddress },
          });
        }
      } finally {
        setIsWithdrawingRewards(false);
      }
    };

    return (
      <GlassCard styleProps={{ backgroundColor: "var(--bg-green-lightest)" }}>
        <div className={style["stake-data-container"]}>
          <div className={style["stake-details-container"]}>
            <div className={style["stake-data-row"]}>
              <div className={style["stake-data-title"]}>Staked amount</div>
              <div className={style["stake-data-value"]}>
                {amount.maxDecimals(4).trim(true).toString()}
              </div>
            </div>

            <div className={style["stake-data-row"]}>
              <div className={style["stake-data-title"]}>Earned rewards</div>
              <div className={style["stake-data-value"]}>
                {!activityStore.getPendingTxnTypes[TXNTYPE.withdrawRewards] ? (
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
              </div>
            </div>

            {/* <div className={style["stake-data-row"]}>
              <div className={style["stake-data-title"]}>Claimable rewards</div>
              <div className={style["stake-data-value"]}>2.21 FET</div>
            </div> */}
          </div>

          <div className={style["stake-buttons"]}>
            <ButtonV2
              variant="light"
              styleProps={{
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: "0px",
                backgroundColor: "transparent",
              }}
              text="Unstake"
              onClick={() => {
                analyticsStore.logEvent("unstake_click", {
                  chainId: chainStore.current.chainId,
                  chainName: chainStore.current.chainName,
                  pageName: "Validator Detail",
                });
                navigate(`/validator/${validatorAddress}/unstake`);
              }}
            />

            <ButtonV2
              variant="light"
              styleProps={{
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: "0px",
                backgroundColor: "#B1FCAB",
              }}
              disabled={
                !rewards ||
                rewards.length === 0 ||
                parseFloat(
                  rewards[0]?.maxDecimals(4).toString().split(" ")[0]
                ) <= 0.0 ||
                activityStore.getPendingTxnTypes[TXNTYPE.withdrawRewards]
              }
              onClick={() => {
                if (activityStore.getPendingTxnTypes[TXNTYPE.withdrawRewards]) {
                  notification.push({
                    type: "danger",
                    placement: "top-center",
                    duration: 5,
                    content: `${TXNTYPE.withdrawRewards} in progress`,
                    canDelete: true,
                    transition: {
                      duration: 0.25,
                    },
                  });
                  return;
                }
                handleClaim();
              }}
              text=""
            >
              Claim rewards
              {activityStore.getPendingTxnTypes[TXNTYPE.withdrawRewards] && (
                <i className="fas fa-spinner fa-spin ml-2 mr-2" />
              )}
            </ButtonV2>
          </div>
        </div>
      </GlassCard>
    );
  }
);
