import React, { ReactElement } from "react";
import { FlatList, View, ViewStyle } from "react-native";
import { formatActivityHash } from "utils/format/format";
import { useStyle } from "styles/index";
import { CardDivider } from "components/card";
import { DetailRow } from "screens/activity/activity-details/activity-row";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { Button } from "components/button";
import { StakeIcon } from "components/new/icon/stake-icon";
import { ArrowUpIcon } from "components/new/icon/arrow-up";
import { AppCurrency } from "@keplr-wallet/types";
import { clearDecimals } from "modals/sign/messages";
import { useStore } from "stores/index";
import { useNetInfo } from "@react-native-community/netinfo";
import Toast from "react-native-toast-message";

interface ItemData {
  title: string;
  value: string;
  hash?: string | undefined;
}

interface ButtonData {
  isVisible: boolean;
  icon?: ReactElement;
  title?: string;
}

export const DetailRows = ({ details }: { details: any }) => {
  const netInfo = useNetInfo();
  const networkIsConnected =
    typeof netInfo.isConnected !== "boolean" || netInfo.isConnected;

  const style = useStyle();
  const { chainStore, analyticsStore } = useStore();
  const fees = JSON.parse(details.fees);
  const mintScanURL = `https://www.mintscan.io/fetchai/tx/${details.hash}/`;
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const currency: AppCurrency = {
    coinDenom: "FET",
    coinMinimalDenom: "afet",
    coinDecimals: 18,
    coinGeckoId: "fetch-ai",
  };
  const handleValidatorClicked = () => {
    analyticsStore.logEvent("stake_click", {
      chainId: chainStore.current.chainId,
      chainName: chainStore.current.chainName,
      pageName: "Activity Detail",
    });
    navigation.navigate("Stake", {
      screen: "Validator.Details",
      params: {
        validatorAddress: details.validatorAddress,
      },
    });
  };

  const handleClicked = () => {
    analyticsStore.logEvent("send_click", {
      pageName: "Activity Detail",
    });
    navigation.navigate("Others", {
      screen: "Send",
      params: {
        currency: currency,
        state: {
          isNext: true,
          noChangeAccount: true,
          configs: {
            amount: details.amt.amount
              ? clearDecimals(
                  (details.amt.amount / 10 ** 18).toFixed(20).toString()
                )
              : clearDecimals(
                  (details.amt[0].amount / 10 ** 18).toFixed(20).toString()
                ),
            denom: details.amountAlphabetic,
            recipient: details.toAddress,
            memo: details.memo,
          },
        },
      },
    });
  };

  const openURL = () => {
    navigation.navigate("Others", {
      screen: "WebView",
      params: {
        url: mintScanURL,
      },
    });
    analyticsStore.logEvent("view_on_mintscan_click", {
      pageName: "Activity Detail",
    });
  };

  const decideButton = React.useCallback((): ButtonData => {
    switch (details.verb) {
      case "Staked":
        return {
          isVisible: true,
          title: "Stake again",
          icon: <StakeIcon size={16} />,
        };

      case "Sent":
        return {
          isVisible: true,
          title: "Send again",
          icon: <ArrowUpIcon size={13} />,
        };

      default:
        return {
          isVisible: false,
        };
    }
  }, []);

  function decideDynamicData(): ItemData[] {
    switch (details.verb) {
      case "Received":
      case "Unstaked":
        return [];

      case "Smart Contract Interaction":
        return [
          {
            title: "Fees",
            value: `${fees[0].amount} ${fees[0].denom}`,
          },
        ];

      default:
        return [
          {
            title: "Gas used/wanted",
            value: details.gasUsed ? details.gasUsed : "-",
          },
          {
            title: "Fees",
            value: `${fees[0].amount} ${fees[0].denom}`,
          },
          {
            title: "Memo",
            value: details.memo.length > 0 ? details.memo : "-",
          },
        ];
    }
  }

  const data: ItemData[] = [
    {
      title: "Transaction hash",
      value: formatActivityHash(details.hash),
      hash: details.hash.toString(),
    },
    {
      title: "Chain ID",
      value: details.chainId,
    },
    ...decideDynamicData(),
    {
      title: "Total amount",
      value: `${details.amountNumber} ${details.amountAlphabetic}`,
    },
  ];

  return (
    <React.Fragment>
      <FlatList
        data={data}
        scrollEnabled={false}
        ItemSeparatorComponent={() => (
          <CardDivider
            style={
              style.flatten([
                "background-color-gray-200@40%",
                "height-1",
                "margin-x-16",
              ]) as ViewStyle
            }
          />
        )}
        renderItem={({ item, index }: { item: ItemData; index: number }) => {
          return (
            <DetailRow
              key={index}
              label={item.title}
              value={item.value}
              hash={item?.hash}
            />
          );
        }}
        keyExtractor={(_item, index) => index.toString()}
      />
      <CardDivider
        style={
          style.flatten([
            "background-color-gray-200@40%",
            "height-1",
            "margin-x-16",
          ]) as ViewStyle
        }
      />
      <View
        style={
          style.flatten([
            "flex-row",
            "justify-evenly",
            "margin-x-16",
            "margin-top-32",
            "margin-bottom-16",
          ]) as ViewStyle
        }
      >
        {decideButton().isVisible && (
          <View style={style.flatten(["flex-1"]) as ViewStyle}>
            <Button
              text={decideButton().title ?? ""}
              size="default"
              mode="outline"
              leftIcon={decideButton().icon}
              textStyle={
                style.flatten([
                  "body3",
                  "color-white",
                  "margin-left-8",
                ]) as ViewStyle
              }
              containerStyle={
                style.flatten([
                  "border-radius-32",
                  "margin-right-6",
                  "border-color-white@40%",
                ]) as ViewStyle
              }
              onPress={() => {
                details.verb === "Staked"
                  ? handleValidatorClicked()
                  : handleClicked();
              }}
            />
          </View>
        )}
        <View style={style.flatten(["flex-1"]) as ViewStyle}>
          <Button
            text="View on Mintscan"
            size="default"
            mode="outline"
            textStyle={
              style.flatten(
                ["body3", "items-center"],
                [
                  // details.status === "Pending"
                  //   ? "color-white@20%"
                  //   :
                  "color-white",
                ]
              ) as ViewStyle
            }
            containerStyle={
              style.flatten(
                ["border-radius-32", "margin-left-6"],
                [
                  // details.status === "Pending"
                  //   ? "border-color-white@20%"
                  //   :
                  "border-color-white@40%",
                ]
              ) as ViewStyle
            }
            onPress={() => {
              if (!networkIsConnected) {
                Toast.show({
                  type: "error",
                  text1: "No internet connection",
                });
                return;
              }
              openURL();
            }}
            // disabled={details.status === "Pending"}
          />
        </View>
      </View>
    </React.Fragment>
  );
};
