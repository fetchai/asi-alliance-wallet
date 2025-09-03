import React, { FunctionComponent, useMemo } from "react";
import { useStore } from "stores/index";
import { Staking } from "@keplr-wallet/stores";
import { FlatList, Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import {
  numberLocalFormat,
  shortenNumber,
  titleCase,
} from "utils/format/format";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { ValidatorThumbnail } from "components/thumbnail";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { CardDivider } from "components/card";
import { VectorCharacter } from "components/vector-character";

interface ItemData {
  title: string;
  value: string;
}

export const ValidatorDetailsCard: FunctionComponent<{
  containerStyle?: ViewStyle;
  validatorAddress: string;
}> = ({ containerStyle, validatorAddress }) => {
  const { chainStore, queriesStore } = useStore();

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

  const validator = useMemo(() => {
    return bondedValidators.validators
      .concat(unbondingValidators.validators)
      .concat(unbondedValidators.validators)
      .find((val) => val.operator_address === validatorAddress);
  }, [
    bondedValidators.validators,
    unbondingValidators.validators,
    unbondedValidators.validators,
    validatorAddress,
  ]);

  const style = useStyle();

  const thumbnail =
    bondedValidators.getValidatorThumbnail(validatorAddress) ||
    unbondingValidators.getValidatorThumbnail(validatorAddress) ||
    unbondedValidators.getValidatorThumbnail(validatorAddress);

  let status;
  let commisionRate;
  if (validator) {
    status = validator.status.split("_")[2].toLowerCase();
    commisionRate = (
      parseFloat(validator.commission.commission_rates.rate) * 100
    ).toFixed(0);
  }

  const inflation = queries.cosmos.queryInflation;
  const { inflation: ARR } = inflation;
  const validatorCom: any = parseFloat(
    validator?.commission.commission_rates.rate || "0"
  );
  const APR = ARR.mul(new Dec(1 - validatorCom));

  const votingPower =
    validator &&
    new CoinPretty(chainStore.current.stakeCurrency, new Dec(validator?.tokens))
      .maxDecimals(0)
      .toString();

  const data: ItemData[] = [
    {
      title: "Delegated",
      value: validator ? shortenNumber(validator?.delegator_shares) : "-",
    },
    {
      title: "Commission",
      value: `${commisionRate}% (20% maximum)`,
    },
    {
      title: "Status",
      value: status ? titleCase(status) : "-",
    },
    {
      title: "APR",
      value: `${APR.maxDecimals(2).trim(true).toString()}%`,
    },
    {
      title: "Voting power",
      value: votingPower
        ? `${numberLocalFormat(votingPower.split(" ")[0])} ${
            votingPower.split(" ")[1]
          }`
        : "NA",
    },
  ];

  return (
    <React.Fragment>
      {validator ? (
        <BlurBackground
          borderRadius={12}
          blurIntensity={16}
          containerStyle={
            [style.flatten(["padding-18"]), containerStyle] as ViewStyle
          }
        >
          <View
            style={
              style.flatten([
                "flex-row",
                "items-center",
                "margin-bottom-12",
              ]) as ViewStyle
            }
          >
            {thumbnail || validator?.description.moniker === undefined ? (
              <ValidatorThumbnail
                size={32}
                url={thumbnail}
                style={style.flatten(["margin-right-10"]) as ViewStyle}
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
                    "margin-right-10",
                  ]) as ViewStyle
                }
              >
                <VectorCharacter
                  char={validator.description.moniker.trim()[0]}
                  color="white"
                  height={12}
                />
              </BlurBackground>
            )}
            <View>
              <Text
                style={style.flatten(["subtitle2", "color-white"]) as ViewStyle}
              >
                {validator.description.moniker?.trim()}
              </Text>

              <Text
                style={
                  style.flatten([
                    "body3",
                    "color-white@80%",
                    "padding-y-2",
                  ]) as ViewStyle
                }
              >
                {Bech32Address.shortenAddress(validatorAddress, 20)}
              </Text>
            </View>
          </View>
          {validator?.description.details ? (
            <Text
              style={style.flatten(["body3", "color-white@80%"]) as ViewStyle}
            >
              {validator?.description.details}
            </Text>
          ) : null}
          <View style={style.flatten(["margin-top-16"]) as ViewStyle}>
            <FlatList
              data={data}
              scrollEnabled={false}
              ItemSeparatorComponent={() => (
                <CardDivider
                  style={
                    style.flatten([
                      "background-color-white@20%",
                      "height-1",
                      "margin-x-0",
                    ]) as ViewStyle
                  }
                />
              )}
              renderItem={({
                item,
                index,
              }: {
                item: ItemData;
                index: number;
              }) => {
                return (
                  <View
                    key={index}
                    style={
                      style.flatten([
                        "flex-row",
                        "justify-between",
                        "margin-y-8",
                      ]) as ViewStyle
                    }
                  >
                    <Text
                      style={
                        style.flatten(["body3", "color-white@60%"]) as ViewStyle
                      }
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={
                        style.flatten([
                          "color-white",
                          "subtitle3",
                          "flex-1",
                          "text-right",
                        ]) as ViewStyle
                      }
                    >
                      {item.value}
                    </Text>
                  </View>
                );
              }}
              keyExtractor={(_item, index) => index.toString()}
            />
          </View>
        </BlurBackground>
      ) : null}
    </React.Fragment>
  );
};
