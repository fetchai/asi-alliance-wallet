import React, { FunctionComponent, useMemo, useState } from "react";
import { Text, View, ViewStyle } from "react-native";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { useStyle } from "styles/index";
import { useStore } from "stores/index";
import { useNetInfo } from "@react-native-community/netinfo";
import {
  formatBalance,
  formatFiatBalance,
  separateNumericAndDenom,
} from "utils/format/format";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import Toast from "react-native-toast-message";
import { ChevronDownIcon } from "components/new/icon/chevron-down";
import { Button } from "components/button";
import { ValidatorThumbnail } from "components/thumbnail";
import {
  CosmosQueriesImpl,
  CosmwasmQueriesImpl,
  ObservableQueryBalances,
  ObservableQueryDelegationsInner,
  SecretQueriesImpl,
  Staking,
} from "@keplr-wallet/stores";
import { TouchableOpacity } from "react-native-gesture-handler";
import { ChevronUpIcon } from "components/new/icon/chevron-up";
import { TransactionModal } from "modals/transaction";
import { ClaimRewardsModal } from "components/new/claim-reward-model";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { SlideDownAnimation } from "components/new/animations/slide-down";
import { AnimatedNumber } from "components/new/animations/animated-number";
import { txnTypeKey, txType } from "components/new/txn-status.tsx";
import { VectorCharacter } from "components/vector-character";
import { KeplrETCQueriesImpl } from "@keplr-wallet/stores-etc";
import Skeleton from "react-native-reanimated-skeleton";

interface ClaimData {
  reward?: CoinPretty;
  validatorAddress: string;
}

interface DeepReadonlyObject {
  queryBalances: ObservableQueryBalances;
  cosmos: CosmosQueriesImpl;
  cosmwasm: CosmwasmQueriesImpl;
  secret: SecretQueriesImpl;
  keplrETC: KeplrETCQueriesImpl;
}

export const MyRewardCard: FunctionComponent<{
  containerStyle?: ViewStyle;
  queries: DeepReadonlyObject;
  queryDelegations: ObservableQueryDelegationsInner;
}> = ({ containerStyle, queries, queryDelegations }) => {
  const style = useStyle();

  const {
    chainStore,
    accountStore,
    priceStore,
    analyticsStore,
    activityStore,
  } = useStore();

  const account = accountStore.getAccount(chainStore.current.chainId);

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

  const delegations = queryDelegations.delegations;

  const queryUnbonding =
    queries.cosmos.queryUnbondingDelegations.getQueryBech32Address(
      account.bech32Address
    );
  const unbonding = queryUnbonding.total;

  const delegated = queryDelegations.total;
  const stakedSum = delegated.add(unbonding);

  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const [showRewars, setShowRewards] = useState(false);
  const [isSendingTx, setIsSendingTx] = useState(false);
  const [showTransectionModal, setTransectionModal] = useState(false);
  const [txnHash, setTxnHash] = useState<string>("");
  const [showClaimModel, setClaimModel] = useState(false);

  const netInfo = useNetInfo();
  const networkIsConnected =
    typeof netInfo.isConnected !== "boolean" || netInfo.isConnected;

  const pendingStakableRewardUSD = priceStore.calculatePrice(
    pendingStakableReward.shrink(true).maxDecimals(6).trim(true)
  );

  const { numericPart: totalNumber, denomPart: totalDenom } =
    separateNumericAndDenom(
      pendingStakableReward.shrink(true).maxDecimals(8).trim(true).toString()
    );
  const handleAllClaim = async () => {
    if (!networkIsConnected) {
      Toast.show({
        type: "error",
        text1: "No Internet Connection",
      });
      return;
    }
    const validatorAddresses =
      queryReward.getDescendingPendingRewardValidatorAddresses(8);
    const tx =
      account.cosmos.makeWithdrawDelegationRewardTx(validatorAddresses);

    setIsSendingTx(true);

    try {
      analyticsStore.logEvent("claim_click", {
        pageName: "Stake",
      });
      let gas =
        account.cosmos.msgOpts.withdrawRewards.gas * validatorAddresses.length;

      // Gas adjustment is 1.5
      // Since there is currently no convenient way to adjust the gas adjustment on the UI,
      // Use high gas adjustment to prevent failure.
      try {
        gas = (await tx.simulate()).gasUsed * 1.5;
      } catch (e) {
        // Some chain with older version of cosmos sdk (below @0.43 version) can't handle the simulation.
        // Therefore, the failure is expected. If the simulation fails, simply use the default value.
        console.log(e);
      }
      setClaimModel(false);
      Toast.show({
        type: "success",
        text1: "Claim In Progress",
      });
      await tx.send(
        { amount: [], gas: gas.toString() },
        "",
        {},
        {
          onBroadcasted: (txHash) => {
            analyticsStore.logEvent("claim_txn_broadcasted", {
              chainId: chainStore.current.chainId,
              chainName: chainStore.current.chainName,
              pageName: "Stake",
            });
            setTxnHash(Buffer.from(txHash).toString("hex"));
            setTransectionModal(true);
          },
        }
      );
    } catch (e) {
      if (
        e?.message === "Request rejected" ||
        e?.message === "Transaction rejected"
      ) {
        Toast.show({
          type: "error",
          text1: "Transaction Rejected",
        });
        return;
      } else {
        Toast.show({
          type: "error",
          text1: e?.message,
        });
      }
      console.log(e);
      analyticsStore.logEvent("claim_txn_broadcasted_fail", {
        chainId: chainStore.current.chainId,
        chainName: chainStore.current.chainName,
        pageName: "Stake",
      });
      navigation.navigate("Home", {});
    } finally {
      setClaimModel(false);
      setIsSendingTx(false);
    }
  };

  return (
    <BlurBackground
      borderRadius={12}
      backgroundBlur={false}
      containerStyle={
        [
          style.flatten(["padding-18", "background-color-gray-5"]),
          containerStyle,
        ] as ViewStyle
      }
    >
      <View
        style={
          style.flatten([
            "flex-row",
            "justify-evenly",
            "items-center",
          ]) as ViewStyle
        }
      >
        <View style={style.flatten(["flex-3"]) as ViewStyle}>
          <Text
            style={
              style.flatten([
                "body3",
                "padding-bottom-6",
                "color-gray-300",
              ]) as ViewStyle
            }
          >
            Staking rewards
          </Text>
          <Skeleton
            isLoading={!stakedSum.isReady}
            containerStyle={
              style.flatten(["flex-row", "flex-wrap"]) as ViewStyle
            }
            layout={[
              {
                key: "totalClaim",
                width: "50%",
                height: 15,
              },
            ]}
            boneColor={"#DCDCE3"}
            highlightColor={"#F6F6F6"}
          >
            <View style={style.flatten(["flex-row", "flex-wrap"]) as ViewStyle}>
              {pendingStakableRewardUSD ? (
                <Text
                  style={
                    [
                      style.flatten(["body3", "color-dark"]),
                      { lineHeight: 14 },
                    ] as ViewStyle
                  }
                >
                  {formatFiatBalance(pendingStakableRewardUSD, 8)}
                </Text>
              ) : (
                <React.Fragment>
                  <AnimatedNumber
                    numberForAnimated={totalNumber as any}
                    includeComma={true}
                    decimalAmount={2}
                    fontSizeValue={14}
                    hookName={"withTiming"}
                    withTimingProps={{
                      durationValue: 1000,
                      easingValue: "linear",
                    }}
                    textColor={style.get("color-dark").color}
                  />
                  <Text
                    style={
                      [
                        style.flatten([
                          "body3",
                          "padding-left-4",
                          "color-gray-300",
                        ]),
                        { lineHeight: 14 },
                      ] as ViewStyle
                    }
                  >
                    {totalDenom}
                  </Text>
                </React.Fragment>
              )}
            </View>
          </Skeleton>
        </View>
        {!(
          !account.isReadyToSendTx ||
          pendingStakableReward.toDec().equals(new Dec(0)) ||
          stakable.toDec().lte(new Dec(0)) ||
          queryReward.pendingRewardValidatorAddresses.length === 0 ||
          !stakedSum.isReady
        ) ? (
          <Button
            text={"Claim All"}
            size="small"
            containerStyle={
              style.flatten([
                "border-radius-64",
                "height-32",
                "padding-x-4",
                "background-color-green-250",
              ]) as ViewStyle
            }
            textStyle={style.flatten(["body3", "color-dark"]) as ViewStyle}
            onPress={() => {
              if (!networkIsConnected) {
                Toast.show({
                  type: "error",
                  text1: "No Internet Connection",
                });
                return;
              }
              if (
                activityStore.getPendingTxnTypes[txnTypeKey.withdrawRewards]
              ) {
                Toast.show({
                  type: "error",
                  text1: `${txType[txnTypeKey.withdrawRewards]} In Progress`,
                });
                return;
              }
              analyticsStore.logEvent("claim_all_staking_reward_click", {
                pageName: "Stake",
              });
              setClaimModel(true);
            }}
            loading={isSendingTx}
            disabled={
              !account.isReadyToSendTx ||
              pendingStakableReward.toDec().equals(new Dec(0)) ||
              queryReward.pendingRewardValidatorAddresses.length === 0
            }
          />
        ) : null}
      </View>
      {!(
        pendingStakableReward.toDec().equals(new Dec(0)) ||
        stakable.toDec().lte(new Dec(0)) ||
        queryReward.pendingRewardValidatorAddresses.length === 0 ||
        delegations.length === 0 ||
        !stakedSum.isReady
      ) ? (
        <TouchableOpacity
          onPress={() => setShowRewards(!showRewars)}
          style={
            style.flatten([
              "margin-top-16",
              "flex-row",
              "items-center",
            ]) as ViewStyle
          }
        >
          <Text
            style={
              [
                style.flatten(["color-dark", "text-caption2"]),
                { lineHeight: 15 },
              ] as ViewStyle
            }
          >
            {!showRewars ? "View Rewards" : "Hide Rewards"}
          </Text>
          <View style={style.flatten(["margin-left-6"]) as ViewStyle}>
            {!showRewars ? (
              <ChevronDownIcon color="#151a1a" size={12} />
            ) : (
              <ChevronUpIcon color="#151a1a" size={12} />
            )}
          </View>
        </TouchableOpacity>
      ) : null}
      {showRewars && (
        <SlideDownAnimation>
          <DelegateReward
            queries={queries}
            queryDelegations={queryDelegations}
          />
        </SlideDownAnimation>
      )}
      <ClaimRewardsModal
        isOpen={showClaimModel}
        close={() => setClaimModel(false)}
        earnedAmount={pendingStakableReward}
        onPress={handleAllClaim}
        buttonLoading={
          isSendingTx ||
          activityStore.getPendingTxnTypes[txnTypeKey.withdrawRewards]
        }
      />
      <TransactionModal
        isOpen={showTransectionModal}
        close={() => {
          setTransectionModal(false);
        }}
        txnHash={txnHash}
        chainId={chainStore.current.chainId}
        onHomeClick={() => navigation.navigate("Home", {})}
        onTryAgainClick={handleAllClaim}
      />
    </BlurBackground>
  );
};

const DelegateReward: FunctionComponent<{
  queries: DeepReadonlyObject;
  queryDelegations: ObservableQueryDelegationsInner;
}> = ({ queries, queryDelegations }) => {
  const style = useStyle();

  const { chainStore, accountStore, analyticsStore, activityStore } =
    useStore();

  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const [isSendingTx, setIsSendingTx] = useState("");
  const [showTransectionModal, setTransectionModal] = useState(false);
  const [txnHash, setTxnHash] = useState<string>("");
  const [showClaimModel, setClaimModel] = useState(false);
  const [claimData, setClaimData] = useState<ClaimData>({
    reward: undefined,
    validatorAddress: "",
  });

  const netInfo = useNetInfo();
  const networkIsConnected =
    typeof netInfo.isConnected !== "boolean" || netInfo.isConnected;

  const account = accountStore.getAccount(chainStore.current.chainId);

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
    if (!networkIsConnected) {
      Toast.show({
        type: "error",
        text1: "No Internet Connection",
      });
      return;
    }
    setIsSendingTx(validatorAddress);

    try {
      analyticsStore.logEvent("claim_click", {
        pageName: "Stake",
      });

      setClaimModel(false);
      Toast.show({
        type: "success",
        text1: "Claim In Progress",
      });
      await account.cosmos.sendWithdrawDelegationRewardMsgs(
        [validatorAddress],
        "",
        undefined,
        undefined,
        {
          onBroadcasted: (txHash) => {
            analyticsStore.logEvent("claim_txn_broadcasted", {
              chainId: chainStore.current.chainId,
              chainName: chainStore.current.chainName,
              pageName: "Stake",
            });
            setTxnHash(Buffer.from(txHash).toString("hex"));
            setTransectionModal(true);
          },
        }
      );
    } catch (e) {
      if (
        e?.message === "Request rejected" ||
        e?.message === "Transaction rejected"
      ) {
        Toast.show({
          type: "error",
          text1: "Transaction Rejected",
        });
        return;
      } else {
        Toast.show({
          type: "error",
          text1: e?.message,
        });
      }
      console.log(e);
      analyticsStore.logEvent("claim_txn_broadcasted_fail", {
        chainId: chainStore.current.chainId,
        chainName: chainStore.current.chainName,
        pageName: "Stake",
      });
      navigation.navigate("Home", {});
    } finally {
      setClaimModel(false);
      setIsSendingTx("");
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
          <View
            key={del.delegation.validator_address}
            style={
              style.flatten([
                "flex-row",
                "justify-evenly",
                "items-center",
                "margin-top-16",
              ]) as ViewStyle
            }
          >
            <View
              style={
                style.flatten([
                  "flex-3",
                  "flex-row",
                  "items-center",
                ]) as ViewStyle
              }
            >
              {thumbnail || val.description.moniker === undefined ? (
                <ValidatorThumbnail
                  size={32}
                  url={thumbnail}
                  style={style.flatten(["margin-right-12"]) as ViewStyle}
                />
              ) : (
                <BlurBackground
                  backgroundBlur={false}
                  containerStyle={
                    {
                      ...style.flatten([
                        "width-32",
                        "height-32",
                        "border-radius-64",
                        "items-center",
                        "justify-center",
                        "margin-right-12",
                      ]),
                      backgroundColor: "#dddfdf",
                    } as ViewStyle
                  }
                >
                  <VectorCharacter
                    char={val.description.moniker.trim()[0]}
                    color="#151a1a"
                    height={12}
                  />
                </BlurBackground>
              )}
              <View>
                <Text
                  style={
                    style.flatten([
                      "body3",

                      "padding-bottom-2",
                      "color-dark",
                    ]) as ViewStyle
                  }
                >
                  {val.description.moniker?.trim()}
                </Text>
                <Text
                  style={
                    style.flatten(["body3", "color-gray-300"]) as ViewStyle
                  }
                >
                  {formatBalance(rewards, 10, false)}
                </Text>
              </View>
            </View>
            {account.isReadyToSendTx ? (
              <View style={style.flatten(["flex-2", "items-end"])}>
                <Button
                  text={"Claim"}
                  size="small"
                  mode="outline"
                  containerStyle={
                    style.flatten([
                      "border-radius-64",
                      "border-color-gray-100",
                      "background-color-green-250",
                      "padding-x-6",
                      "height-30",
                    ]) as ViewStyle
                  }
                  textStyle={
                    style.flatten(["body3", "color-dark"]) as ViewStyle
                  }
                  onPress={() => {
                    if (!networkIsConnected) {
                      Toast.show({
                        type: "error",
                        text1: "No Internet Connection",
                      });
                      return;
                    }
                    if (
                      activityStore.getPendingTxnTypes[
                        txnTypeKey.withdrawRewards
                      ]
                    ) {
                      Toast.show({
                        type: "error",
                        text1: `${
                          txType[txnTypeKey.withdrawRewards]
                        } In Progress`,
                      });
                      return;
                    }
                    analyticsStore.logEvent("claim_staking_reward_click", {
                      pageName: "Stake",
                    });
                    setClaimData({
                      reward: rewards,
                      validatorAddress: val.operator_address,
                    });
                    setClaimModel(true);
                  }}
                  disabled={!account.isReadyToSendTx}
                  loading={isSendingTx == val.operator_address}
                  showLoadingSpinner={true}
                  loaderColor={style.get("color-dark").color}
                />
              </View>
            ) : null}
          </View>
        ) : null;
      })}
      <ClaimRewardsModal
        isOpen={showClaimModel}
        close={() => setClaimModel(false)}
        earnedAmount={claimData.reward}
        onPress={() => handleClaim(claimData.validatorAddress)}
        buttonLoading={isSendingTx == claimData.validatorAddress}
      />
      <TransactionModal
        isOpen={showTransectionModal}
        close={() => setTransectionModal(false)}
        txnHash={txnHash}
        chainId={chainStore.current.chainId}
        onHomeClick={() => navigation.navigate("Home", {})}
        onTryAgainClick={() => handleClaim(claimData.validatorAddress)}
      />
    </React.Fragment>
  );
};
