import React, { FunctionComponent, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "stores/index";
import { ActivityIndicator, Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import {
  CosmosQueriesImpl,
  CosmwasmQueriesImpl,
  ObservableQueryBalances,
  ObservableQueryDelegationsInner,
  SecretQueriesImpl,
  Staking,
} from "@keplr-wallet/stores";
import { ValidatorThumbnail } from "components/thumbnail";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { Dec } from "@keplr-wallet/unit";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { VectorCharacter } from "components/vector-character";
import { KeplrETCQueriesImpl } from "@keplr-wallet/stores-etc";

interface DeepReadonlyObject {
  queryBalances: ObservableQueryBalances;
  cosmos: CosmosQueriesImpl;
  cosmwasm: CosmwasmQueriesImpl;
  secret: SecretQueriesImpl;
  keplrETC: KeplrETCQueriesImpl;
}

export const DelegationsCard: FunctionComponent<{
  containerStyle?: ViewStyle;
  queries: DeepReadonlyObject;
  queryDelegations: ObservableQueryDelegationsInner;
  accountBech32Address: string;
}> = observer(
  ({ containerStyle, queries, queryDelegations, accountBech32Address }) => {
    const { priceStore, analyticsStore } = useStore();

    const style = useStyle();

    const navigation = useNavigation<NavigationProp<ParamListBase>>();

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

            const amount = queryDelegations.getDelegationTo(
              val.operator_address
            );
            const amountUSD = priceStore.calculatePrice(
              amount.maxDecimals(5).trim(true).shrink(true)
            );
            const reward = queries.cosmos.queryRewards
              .getQueryBech32Address(accountBech32Address)
              .getStakableRewardOf(val.operator_address);

            const inflation = queries.cosmos.queryInflation;
            const { inflation: ARR } = inflation;
            const validatorCom: any = parseFloat(
              val?.commission.commission_rates.rate || "0"
            );
            const APR = ARR.mul(new Dec(1 - validatorCom));
            return (
              <BlurBackground
                key={del.delegation.validator_address}
                borderRadius={12}
                blurIntensity={20}
                containerStyle={
                  [
                    style.flatten(["padding-18", "flex-row"]),
                    containerStyle,
                  ] as ViewStyle
                }
                onPress={() => {
                  analyticsStore.logEvent("stake_validator_click", {
                    pageName: "Stake",
                  });
                  navigation.navigate("Stake", {
                    screen: "Validator.Details",
                    params: {
                      validatorAddress: del.delegation.validator_address,
                    },
                  });
                }}
              >
                <View
                  style={
                    style.flatten([
                      "width-32",
                      "margin-right-10",
                      "margin-top-6",
                    ]) as ViewStyle
                  }
                >
                  {thumbnail || val.description.moniker === undefined ? (
                    <ValidatorThumbnail size={32} url={thumbnail} />
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
                </View>
                <View style={style.flatten(["flex-1"])}>
                  <View style={style.flatten(["flex-row", "items-center"])}>
                    <View style={style.flatten(["flex-1"])}>
                      <Text
                        style={
                          style.flatten([
                            "body3",
                            "color-white",
                            "margin-bottom-2",
                          ]) as ViewStyle
                        }
                      >
                        {val.description.moniker?.trim()}
                      </Text>
                      <Text
                        style={
                          style.flatten([
                            "body3",
                            "color-white@60%",
                            "font-medium",
                          ]) as ViewStyle
                        }
                      >
                        {amount
                          .maxDecimals(4)
                          .trim(true)
                          .shrink(true)
                          .toString()}
                      </Text>
                    </View>
                    <View style={style.flatten(["items-end"])}>
                      {amountUSD ? (
                        <View style={style.flatten(["flex-row"]) as ViewStyle}>
                          <Text
                            style={
                              style.flatten([
                                "body3",
                                "color-white",
                                "margin-right-2",
                              ]) as ViewStyle
                            }
                          >
                            {amountUSD
                              .shrink(true)
                              .maxDecimals(6)
                              .trim(true)
                              .toString()}
                          </Text>
                          <Text
                            style={
                              style.flatten([
                                "body3",
                                "color-white@60%",
                              ]) as ViewStyle
                            }
                          >
                            {priceStore.defaultVsCurrency.toUpperCase()}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View
                    style={
                      style.flatten([
                        "height-1",
                        "background-color-white@20%",
                        "margin-y-10",
                      ]) as ViewStyle
                    }
                  />
                  <View style={style.flatten(["flex-row", "items-center"])}>
                    <Text
                      style={
                        style.flatten([
                          "flex-1",
                          "text-caption2",
                          "color-white@60%",
                        ]) as ViewStyle
                      }
                    >
                      {`${APR.maxDecimals(2).trim(true).toString()}% APR`}
                    </Text>
                    <View
                      style={
                        style.flatten(["flex-row", "items-end"]) as ViewStyle
                      }
                    >
                      <Text
                        style={
                          style.flatten([
                            "text-caption2",
                            "color-white",
                          ]) as ViewStyle
                        }
                      >
                        {reward
                          .maxDecimals(6)
                          .trim(true)
                          .shrink(true)
                          .toString()}
                      </Text>
                      <Text
                        style={
                          style.flatten([
                            "text-caption2",
                            "color-white@60%",
                            "margin-left-2",
                          ]) as ViewStyle
                        }
                      >
                        Earned
                      </Text>
                    </View>
                  </View>
                </View>
              </BlurBackground>
            );
          })
        ) : (
          <ActivityIndicator
            size="large"
            color={style.get("color-white").color}
          />
        )}
      </React.Fragment>
    );
  }
);
