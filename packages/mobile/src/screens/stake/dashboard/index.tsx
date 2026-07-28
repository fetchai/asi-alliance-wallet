import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import { useStyle } from "styles/index";
import {
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { StakeCard } from "./stake-card";
import { MyRewardCard } from "./reward-card";
import { useStore } from "stores/index";
import { Button } from "components/button";
import { DelegationsCard } from "./delegations-card";
import { UnbondingCard } from "./unbonding-card";
import { IconWithText } from "components/new/icon-with-text/icon-with-text";
import { EarnIcon } from "components/new/icon/earn-icon";
import {
  NavigationProp,
  ParamListBase,
  RouteProp,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Dec } from "@keplr-wallet/unit";
import { PageWithScrollView } from "components/page";
import { observer } from "mobx-react-lite";
import { useFocusedScreen } from "providers/focused-screen";

export const StakingDashboardScreen: FunctionComponent = observer(() => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          isTab?: boolean;
        }
      >,
      string
    >
  >();

  const isTab = route.params?.isTab ?? true;

  const { chainStore, accountStore, queriesStore, priceStore, analyticsStore } =
    useStore();

  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const safeAreaInsets = useSafeAreaInsets();

  const [refreshing, setRefreshing] = useState(false);

  const style = useStyle();

  const scrollViewRef = useRef<ScrollView | null>(null);

  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);
  const focusedScreen = useFocusedScreen();
  const queryDelegations =
    queries.cosmos.queryDelegations.getQueryBech32Address(
      account.bech32Address
    );
  const delegations = queryDelegations.delegations.filter((d) =>
    new Dec(d.balance.amount).gt(new Dec(0))
  );

  const queryUnbondingDelegations =
    queries.cosmos.queryUnbondingDelegations.getQueryBech32Address(
      account.bech32Address
    );
  const hasUnbonding = !queryUnbondingDelegations.total.toDec().isZero();

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0 });
    }
  }, [chainStore.current.chainId]);

  const onRefresh = React.useCallback(async () => {
    // Because the components share the states related to the queries,
    // fetching new query responses here would make query responses on all other components also refresh.
    setRefreshing(true);
    await Promise.all([
      priceStore.waitFreshResponse(),
      ...queries.queryBalances
        .getQueryBech32Address(account.bech32Address)
        .balances.map((bal) => {
          return bal.waitFreshResponse();
        }),
      queries.cosmos.queryRewards
        .getQueryBech32Address(account.bech32Address)
        .waitFreshResponse(),
      queries.cosmos.queryDelegations
        .getQueryBech32Address(account.bech32Address)
        .waitFreshResponse(),
      queries.cosmos.queryUnbondingDelegations
        .getQueryBech32Address(account.bech32Address)
        .waitFreshResponse(),
    ]).finally(() => {
      setRefreshing(false);
    });
  }, [accountStore, chainStore, priceStore, queriesStore]);

  /// Hide Refreshing when tab change
  useEffect(() => {
    if (focusedScreen.name !== "Stake" && refreshing) {
      setRefreshing(false);
    }
  }, [focusedScreen.name, refreshing]);

  return (
    <PageWithScrollView
      backgroundMode="secondary"
      style={style.flatten(["padding-x-page", "overflow-scroll"]) as ViewStyle}
      contentContainerStyle={[
        style.get("flex-grow-1"),
        {
          paddingTop: isTab ? (Platform.OS === "ios" ? 0 : 48) : 0,
        },
      ]}
      refreshControl={
        <RefreshControl
          tintColor={"black"}
          refreshing={refreshing}
          onRefresh={onRefresh}
          progressViewOffset={isTab ? (Platform.OS === "ios" ? 0 : 48) : 0}
        />
      }
      ref={scrollViewRef}
    >
      <Text
        style={
          style.flatten([
            "h1",
            "color-dark",
            "margin-top-16",
            "margin-bottom-14",
            "font-normal",
          ]) as ViewStyle
        }
      >
        Stake
      </Text>
      <StakeCard />
      {(delegations && delegations.length > 0) || hasUnbonding ? (
        <React.Fragment>
          <Button
            text="Stake More"
            containerStyle={
              style.flatten([
                "border-radius-64",
                "margin-y-32",
                "background-color-dark",
              ]) as ViewStyle
            }
            textStyle={style.flatten(["body2", "color-white"]) as ViewStyle}
            onPress={() => {
              analyticsStore.logEvent("stake_click", {
                chainId: chainStore.current.chainId,
                chainName: chainStore.current.chainName,
                pageName: "Stake",
              });
              navigation.navigate("Stake", {
                screen: "Validator.List",
                params: {},
              });
            }}
          />
          {delegations && delegations.length > 0 && (
            <React.Fragment>
              <MyRewardCard
                queries={queries}
                queryDelegations={queryDelegations}
                containerStyle={
                  style.flatten(["margin-bottom-24"]) as ViewStyle
                }
              />
              <DelegationsCard
                containerStyle={style.flatten(["margin-y-6"]) as ViewStyle}
                queries={queries}
                queryDelegations={queryDelegations}
                accountBech32Address={account.bech32Address}
              />
            </React.Fragment>
          )}
          {hasUnbonding && (
            <UnbondingCard
              containerStyle={style.flatten(["margin-y-6"]) as ViewStyle}
              accountBech32Address={account.bech32Address}
            />
          )}
        </React.Fragment>
      ) : (
        <View
          style={
            style.flatten([
              "height-half",
              "justify-center",
              "items-center",
            ]) as ViewStyle
          }
        >
          <IconWithText
            icon={
              <EarnIcon
                size={72}
                color1="#151a1a"
                color2="#151a1a"
                color3="#151a1a"
              />
            }
            iconStyle={{ marginBottom: 8 }}
            title={"Start staking now"}
            subtitle={
              "Stake your assets to earn rewards and\ncontribute to maintaining the networks"
            }
            titleStyle={
              [
                style.flatten(["h3", "font-normal"]),
                { marginTop: 3 },
              ] as ViewStyle
            }
            subtitleStyle={
              style.flatten(["body3", "color-gray-300"]) as ViewStyle
            }
            containerStyle={style.flatten(["items-center"])}
          />
          <Button
            containerStyle={
              style.flatten([
                "border-radius-64",
                "margin-top-18",
                "background-color-dark",
                "width-full",
              ]) as ViewStyle
            }
            textStyle={style.flatten(["body2", "color-white"]) as ViewStyle}
            text={"Start Staking"}
            onPress={() => {
              analyticsStore.logEvent("stake_click", {
                chainId: chainStore.current.chainId,
                chainName: chainStore.current.chainName,
                pageName: "Stake",
              });
              navigation.navigate("Stake", {
                screen: "Validator.List",
                params: {},
              });
            }}
          />
        </View>
      )}
      <View style={{ height: isTab ? 100 + safeAreaInsets.bottom : 0 }} />
    </PageWithScrollView>
  );
});
