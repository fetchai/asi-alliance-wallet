import React, { FunctionComponent, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "stores/index";
import { PageWithSectionList } from "components/page";
import { Text, TouchableOpacity, View, ViewStyle } from "react-native";
import { Staking } from "@keplr-wallet/stores";
import { useStyle } from "styles/index";
import { TextInput } from "components/input";
import { useSmartNavigation } from "navigation/smart-navigation";
import { Dec } from "@keplr-wallet/unit";
import { RouteProp, useRoute } from "@react-navigation/native";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { SearchIcon } from "components/new/icon/search-icon";
import { EmptyView } from "components/new/empty";
import { StakeValidatorCardView } from "components/new/stake-validetor-card/stake-validator";
import { ChevronRightIcon } from "components/new/icon/chevron-right";
import { shortenNumber } from "utils/format/format";
import { STAKE_VALIDATOR_URL } from "../../../../config";
import { SortIcon } from "components/new/icon/sort";
import { SelectorModal } from "components/new/selector-model/selector";
import { CheckIcon } from "components/new/icon/check";

type Sort = "APR" | "Voting Power" | "Name";

export const NewValidatorListScreen: FunctionComponent = observer(() => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          prevSelectedValidator?: string;
          selectedValidator?: string;
        }
      >,
      string
    >
  >();

  const { chainStore, queriesStore } = useStore();

  const queries = queriesStore.get(chainStore.current.chainId);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("Voting Power");
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);

  const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Bonded
  );

  const style = useStyle();

  const data = useMemo(() => {
    let data = bondedValidators.validators;
    const searchTrim = search.trim();
    if (searchTrim) {
      data = data.filter((val) =>
        val.description.moniker
          ?.toLowerCase()
          .includes(searchTrim.toLowerCase())
      );
    }
    switch (sort) {
      case "APR":
        data.sort((val1, val2) => {
          return new Dec(val1.commission.commission_rates.rate).gt(
            new Dec(val2.commission.commission_rates.rate)
          )
            ? 1
            : -1;
        });
        break;
      case "Name":
        data.sort((val1, val2) => {
          if (!val1.description.moniker) {
            return -1;
          }
          if (!val2.description.moniker) {
            return 1;
          }
          return val1.description.moniker > val2.description.moniker ? 1 : -1;
        });
        break;
      case "Voting Power":
        data.sort((val1, val2) => {
          return new Dec(val1.tokens).gt(new Dec(val2.tokens)) ? -1 : 1;
        });
        break;
    }

    return data;
  }, [bondedValidators.validators, search, sort]);

  const apr = queries.cosmos.queryInflation.inflation;

  const items = useMemo(() => {
    // If inflation is 0 or not fetched properly, there is no need to sort by APY.
    if (apr.toDec().gt(new Dec(0))) {
      return [
        { label: "APR", key: "APR" },
        { label: "Voting Power", key: "Voting Power" },
        { label: "Name", key: "Name" },
      ];
    } else {
      return [
        { label: "Voting Power", key: "Voting Power" },
        { label: "Name", key: "Name" },
      ];
    }
  }, [apr]);

  return (
    <React.Fragment>
      <SelectorModal
        close={() => {
          setIsSortModalOpen(false);
        }}
        isOpen={isSortModalOpen}
        items={items}
        selectedKey={sort}
        setSelectedKey={(key) => setSort(key as Sort)}
      />
      <PageWithSectionList
        backgroundMode="image"
        sections={[
          {
            data,
          },
        ]}
        style={style.flatten(["overflow-scroll"]) as ViewStyle}
        contentContainerStyle={style.flatten(["margin-x-20"]) as ViewStyle}
        stickySectionHeadersEnabled={false}
        keyExtractor={(item: Staking.Validator) => item.operator_address}
        renderItem={({
          item,
          index,
        }: {
          item: Staking.Validator;
          index: number;
        }) => {
          return (
            <ValidatorItem
              validatorAddress={item.operator_address}
              index={index}
              prevSelectedValidator={route.params.prevSelectedValidator}
              selectedValidator={route.params.selectedValidator}
            />
          );
        }}
        renderSectionHeader={() => {
          return (
            <React.Fragment>
              <View style={style.flatten(["margin-top-16"]) as ViewStyle}>
                <BlurBackground borderRadius={12} blurIntensity={20}>
                  <TextInput
                    placeholder="Search"
                    placeholderTextColor={"white"}
                    style={style.flatten(["body3"]) as ViewStyle}
                    value={search}
                    inputContainerStyle={
                      style.flatten([
                        "border-width-0",
                        "padding-x-18",
                        "padding-y-10",
                      ]) as ViewStyle
                    }
                    onChangeText={(text) => {
                      setSearch(text);
                    }}
                    containerStyle={style.flatten(["padding-0"]) as ViewStyle}
                    inputRight={<SearchIcon size={12} />}
                  />
                </BlurBackground>
              </View>
              {data.length === 0 ? (
                <EmptyView
                  text="No results found"
                  containerStyle={style.flatten(["margin-y-16"]) as ViewStyle}
                />
              ) : (
                <TouchableOpacity
                  style={
                    style.flatten([
                      "flex-row",
                      "border-width-1",
                      "border-color-white@40%",
                      "border-radius-64",
                      "padding-x-12",
                      "padding-y-6",
                      "items-center",
                      "margin-y-16",
                    ]) as ViewStyle
                  }
                  onPress={() => {
                    setIsSortModalOpen(true);
                  }}
                >
                  <View
                    style={style.flatten(["flex-3", "flex-row"]) as ViewStyle}
                  >
                    <Text
                      style={
                        [
                          style.flatten(["body3", "color-white@60%"]),
                          { lineHeight: 17 },
                        ] as ViewStyle
                      }
                    >
                      Sort by
                    </Text>
                    <Text
                      style={
                        [
                          style.flatten([
                            "body3",
                            "color-white",
                            "margin-left-8",
                          ]),
                          { lineHeight: 17 },
                        ] as ViewStyle
                      }
                    >
                      {sort}
                    </Text>
                  </View>
                  <View style={style.flatten(["justify-end"]) as ViewStyle}>
                    <SortIcon />
                  </View>
                </TouchableOpacity>
              )}
            </React.Fragment>
          );
        }}
      />
    </React.Fragment>
  );
});

const ValidatorItem: FunctionComponent<{
  validatorAddress: string;
  prevSelectedValidator?: string;
  selectedValidator?: string;
  index: number;
}> = observer(
  ({ validatorAddress, prevSelectedValidator, selectedValidator }) => {
    const { chainStore, queriesStore, analyticsStore } = useStore();

    const queries = queriesStore.get(chainStore.current.chainId);

    const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
      Staking.BondStatus.Bonded
    );

    const style = useStyle();
    let status;
    let commisionRate;

    const validator = bondedValidators.getValidator(validatorAddress);
    if (validator) {
      status = validator.status.split("_")[2].toLowerCase();
      commisionRate = (
        parseFloat(validator.commission.commission_rates.rate) * 100
      ).toFixed(2);
    }

    const inflation = queries.cosmos.queryInflation;
    const { inflation: ARR } = inflation;
    const validatorCom: any = parseFloat(
      validator?.commission.commission_rates.rate || "0"
    );
    const APR = ARR.mul(new Dec(1 - validatorCom));

    const smartNavigation = useSmartNavigation();

    const prevSelectValidatorAdress = prevSelectedValidator
      ? prevSelectedValidator
      : "";

    return validator ? (
      prevSelectValidatorAdress !== validatorAddress ? (
        <StakeValidatorCardView
          containerStyle={
            style.flatten(
              ["margin-bottom-6"],

              [
                selectedValidator == validatorAddress &&
                  "background-color-indigo",
              ]
            ) as ViewStyle
          }
          heading={validator.description.moniker?.trim()}
          validatorAddress={validatorAddress}
          thumbnailUrl={bondedValidators.getValidatorThumbnail(
            validator.operator_address
          )}
          trailingIcon={
            selectedValidator == validatorAddress ? (
              <CheckIcon color="white" />
            ) : (
              <ChevronRightIcon />
            )
          }
          delegated={shortenNumber(validator.delegator_shares)}
          commission={commisionRate}
          status={status}
          apr={`${APR.maxDecimals(2).trim(true).toString()}%`}
          onPress={
            !(selectedValidator == validatorAddress)
              ? () => {
                  if (prevSelectedValidator) {
                    smartNavigation.navigateSmart;
                    smartNavigation.navigate("SelectorValidator.Details", {
                      prevSelectedValidator: prevSelectValidatorAdress,
                      validatorAddress: validatorAddress,
                    });
                  } else {
                    analyticsStore.logEvent("stake_validator_click", {
                      pageName: "Validator Detail",
                    });
                    smartNavigation.navigateSmart("NewValidator.Details", {
                      validatorAddress,
                    });
                  }
                }
              : undefined
          }
          onExplorerPress={() => {
            smartNavigation.navigateSmart("WebView", {
              url: `${
                STAKE_VALIDATOR_URL[chainStore.current.chainId]
              }/${validatorAddress}`,
            });
          }}
        />
      ) : null
    ) : null;
  }
);
