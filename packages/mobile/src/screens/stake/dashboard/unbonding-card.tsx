import React, { FunctionComponent, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "stores/index";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { Staking } from "@keplr-wallet/stores";
import { ValidatorThumbnail } from "components/thumbnail";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { VectorCharacter } from "components/vector-character";
import { IconButton } from "components/new/button/icon";
import { formatBalance, formatFiatBalance } from "utils/format/format";
import moment from "moment";

export const UnbondingCard: FunctionComponent<{
  containerStyle?: ViewStyle;
  accountBech32Address: string;
}> = observer(({ containerStyle, accountBech32Address }) => {
  const { chainStore, queriesStore, priceStore } = useStore();
  const style = useStyle();

  const queries = queriesStore.get(chainStore.current.chainId);

  const queryUnbonding =
    queries.cosmos.queryUnbondingDelegations.getQueryBech32Address(
      accountBech32Address
    );

  const unbondings = queryUnbonding.unbondingBalances?.filter((item) =>
    item?.entries?.some((entry) => !entry?.balance?.toDec().isZero())
  );

  const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Bonded
  );
  const unbondingValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonding
  );
  const unbondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonded
  );

  const validatorsMap = useMemo(() => {
    const validators = bondedValidators.validators
      .concat(unbondingValidators.validators)
      .concat(unbondedValidators.validators);
    const map = new Map<string, Staking.Validator>();
    validators.forEach((v) => map.set(v.operator_address, v));
    return map;
  }, [
    bondedValidators.validators,
    unbondingValidators.validators,
    unbondedValidators.validators,
  ]);

  const unbondingEntriesCount =
    unbondings
      ?.flatMap((item) => item.entries)
      .filter((entry) => !entry?.balance?.toDec().isZero()).length ?? 0;

  if (unbondings.length === 0 || unbondingEntriesCount === 0) {
    return null;
  }

  return (
    <React.Fragment>
      <View
        style={
          style.flatten([
            "flex-row",
            "padding-y-6",
            "margin-bottom-6",
            "items-center",
          ]) as ViewStyle
        }
      >
        <Text
          style={
            [
              style.flatten(["color-gray-300", "body3"]),
              { lineHeight: 16 },
            ] as ViewStyle
          }
        >
          Unbonding balances
        </Text>
        <IconButton
          icon={
            <Text
              style={
                [
                  style.flatten(["text-caption2", "color-dark", "font-bold"]),
                  { lineHeight: 14 },
                ] as ViewStyle
              }
            >
              {unbondingEntriesCount}
            </Text>
          }
          iconStyle={
            style.flatten([
              "padding-x-12",
              "padding-y-4",
              "margin-left-6",
            ]) as ViewStyle
          }
        />
      </View>
      {unbondings.map((ubd) => {
        const val = validatorsMap.get(ubd.validatorAddress);
        if (!val) return null;

        const thumbnail =
          bondedValidators.getValidatorThumbnail(val.operator_address) ||
          unbondingValidators.getValidatorThumbnail(val.operator_address) ||
          unbondedValidators.getValidatorThumbnail(val.operator_address);

        return (
          <React.Fragment key={ubd.validatorAddress}>
            {ubd.entries
              .filter((entry) => !entry?.balance?.toDec().isZero())
              .map((entry) => {
                const completionTime = moment(entry.completionTime).fromNow();
                const amountUSD = priceStore.calculatePrice(
                  entry.balance.trim(true).shrink(true)
                );
                return (
                  <BlurBackground
                    key={`${ubd.validatorAddress}-${entry.completionTime}`}
                    borderRadius={12}
                    backgroundBlur={false}
                    containerStyle={
                      [
                        style.flatten([
                          "padding-18",
                          "flex-row",
                          "background-color-gray-5",
                          "margin-bottom-6",
                        ]),
                        containerStyle,
                      ] as ViewStyle
                    }
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
                          backgroundBlur={false}
                          containerStyle={
                            {
                              ...style.flatten([
                                "width-32",
                                "height-32",
                                "border-radius-64",
                                "items-center",
                                "justify-center",
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
                    </View>
                    <View style={style.flatten(["flex-1"])}>
                      <View style={style.flatten(["flex-row", "items-center"])}>
                        <View style={style.flatten(["flex-1"])}>
                          <Text
                            style={
                              style.flatten([
                                "body3",
                                "color-dark",
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
                                "color-gray-300",
                                "font-medium",
                              ]) as ViewStyle
                            }
                          >
                            {formatBalance(entry.balance)}
                          </Text>
                        </View>
                        {amountUSD ? (
                          <View style={style.flatten(["items-end"])}>
                            <View
                              style={style.flatten(["flex-row"]) as ViewStyle}
                            >
                              <Text
                                style={
                                  style.flatten([
                                    "body3",
                                    "color-dark",
                                    "margin-right-2",
                                  ]) as ViewStyle
                                }
                              >
                                {formatFiatBalance(amountUSD)}
                              </Text>
                              <Text
                                style={
                                  style.flatten([
                                    "body3",
                                    "color-gray-300",
                                  ]) as ViewStyle
                                }
                              >
                                {priceStore.defaultVsCurrency.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                        ) : null}
                      </View>
                      <View
                        style={
                          style.flatten([
                            "height-1",
                            "background-color-gray-100",
                            "margin-y-10",
                          ]) as ViewStyle
                        }
                      />
                      <Text
                        style={
                          style.flatten([
                            "text-caption2",
                            "color-gray-300",
                          ]) as ViewStyle
                        }
                      >
                        {`Unbonding · Completes ${completionTime}`}
                      </Text>
                    </View>
                  </BlurBackground>
                );
              })}
          </React.Fragment>
        );
      })}
    </React.Fragment>
  );
});
