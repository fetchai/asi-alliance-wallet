import React, { FunctionComponent, useMemo, useState } from "react";
import { Text, View, ViewStyle } from "react-native";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { useStyle } from "styles/index";
import { GradientButton } from "components/new/button/gradient-button";
import { useStore } from "stores/index";
import { useNetInfo } from "@react-native-community/netinfo";
import {
  numberLocalFormat,
  separateNumericAndDenom,
} from "utils/format/format";
import { Dec } from "@keplr-wallet/unit";
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
  reward: string;
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
        text1: "No internet connection",
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
        text1: "claim in process",
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
          text1: "Transaction rejected",
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
      blurIntensity={20}
      containerStyle={
        [style.flatten(["padding-18"]), containerStyle] as ViewStyle
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
                "color-white@60%",
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
            boneColor={style.get("color-white@20%").color}
            highlightColor={style.get("color-white@60%").color}
          >
            <View style={style.flatten(["flex-row", "flex-wrap"]) as ViewStyle}>
              <AnimatedNumber
                numberForAnimated={
                  pendingStakableRewardUSD
                    ? pendingStakableRewardUSD
                        .shrink(true)
                        .maxDecimals(8)
                        .trim(true)
                        .toString()
                    : totalNumber
                }
                includeComma={true}
                decimalAmount={2}
                fontSizeValue={14}
                hookName={"withTiming"}
                withTimingProps={{
                  durationValue: 1000,
                  easingValue: "linear",
                }}
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
                {pendingStakableRewardUSD
                  ? priceStore.defaultVsCurrency.toUpperCase()
                  : totalDenom}
              </Text>
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
          <GradientButton
            text={"Claim all"}
            color1={"#F9774B"}
            color2={"#CF447B"}
            rippleColor="black@50%"
            size="small"
            containerStyle={
              style.flatten(["border-radius-64", "height-32"]) as ViewStyle
            }
            buttonStyle={style.flatten(["padding-x-4"]) as ViewStyle}
            textStyle={style.flatten(["body3"]) as ViewStyle}
            onPress={() => {
              if (!networkIsConnected) {
                Toast.show({
                  type: "error",
                  text1: "No internet connection",
                });
                return;
              }
              if (
                activityStore.getPendingTxnTypes[txnTypeKey.withdrawRewards]
              ) {
                Toast.show({
                  type: "error",
                  text1: `${txType[txnTypeKey.withdrawRewards]} in progress`,
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
                style.flatten(["color-indigo-250", "text-caption2"]),
                { lineHeight: 15 },
              ] as ViewStyle
            }
          >
            {!showRewars ? "View rewards" : "Hide rewards"}
          </Text>
          <View style={style.flatten(["margin-left-6"]) as ViewStyle}>
            {!showRewars ? (
              <ChevronDownIcon color="#BFAFFD" size={12} />
            ) : (
              <ChevronUpIcon color="#BFAFFD" size={12} />
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
        earnedAmount={`${numberLocalFormat(
          pendingStakableReward.shrink(true).trim(true).toString().split(" ")[0]
        )} ${
          pendingStakableReward.shrink(true).trim(true).toString().split(" ")[1]
        }`}
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
        buttonText="Go to activity screen"
        onHomeClick={() => navigation.navigate("ActivityTab", {})}
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
    reward: "",
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
        text1: "No internet connection",
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
        text1: "claim in process",
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
          text1: "Transaction rejected",
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
                  backgroundBlur={true}
                  blurIntensity={16}
                  containerStyle={
                    style.flatten([
                      "width-32",
                      "height-32",
                      "border-radius-64",
                      "items-center",
                      "justify-center",
                      "margin-right-12",
                    ]) as ViewStyle
                  }
                >
                  <VectorCharacter
                    char={val.description.moniker.trim()[0]}
                    color="white"
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
                      "color-white",
                    ]) as ViewStyle
                  }
                >
                  {val.description.moniker?.trim()}
                </Text>
                <Text
                  style={
                    style.flatten(["body3", "color-white@60%"]) as ViewStyle
                  }
                >
                  {`${numberLocalFormat(
                    rewards
                      .maxDecimals(8)
                      .trim(true)
                      .shrink(true)
                      .toString()
                      .split(" ")[0]
                  )} ${
                    rewards
                      .maxDecimals(8)
                      .trim(true)
                      .shrink(true)
                      .toString()
                      .split(" ")[1]
                  }`}
                </Text>
              </View>
            </View>
            {account.isReadyToSendTx ? (
              <View style={style.flatten(["flex-2", "items-end"])}>
                <Button
                  text={"Claim"}
                  rippleColor="black@50%"
                  size="small"
                  mode="outline"
                  containerStyle={
                    style.flatten([
                      "border-radius-64",
                      "border-color-white@40%",
                      "padding-x-6",
                      "height-30",
                    ]) as ViewStyle
                  }
                  textStyle={
                    style.flatten(["body3", "color-white"]) as ViewStyle
                  }
                  onPress={() => {
                    if (!networkIsConnected) {
                      Toast.show({
                        type: "error",
                        text1: "No internet connection",
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
                        } in progress`,
                      });
                      return;
                    }
                    analyticsStore.logEvent("claim_staking_reward_click", {
                      pageName: "Stake",
                    });
                    setClaimData({
                      reward: rewards
                        .maxDecimals(10)
                        .trim(true)
                        .shrink(true)
                        .toString(),
                      validatorAddress: val.operator_address,
                    });
                    setClaimModel(true);
                  }}
                  disabled={!account.isReadyToSendTx}
                  loading={isSendingTx == val.operator_address}
                />
              </View>
            ) : null}
          </View>
        ) : null;
      })}
      <ClaimRewardsModal
        isOpen={showClaimModel}
        close={() => setClaimModel(false)}
        earnedAmount={`${numberLocalFormat(claimData.reward.split(" ")[0])} ${
          claimData.reward.split(" ")[1]
        }`}
        onPress={() => handleClaim(claimData.validatorAddress)}
        buttonLoading={isSendingTx == claimData.validatorAddress}
      />
      <TransactionModal
        isOpen={showTransectionModal}
        close={() => setTransectionModal(false)}
        txnHash={txnHash}
        chainId={chainStore.current.chainId}
        buttonText="Go to activity screen"
        onHomeClick={() => navigation.navigate("ActivityTab", {})}
        onTryAgainClick={() => handleClaim(claimData.validatorAddress)}
      />
    </React.Fragment>
  );
};
