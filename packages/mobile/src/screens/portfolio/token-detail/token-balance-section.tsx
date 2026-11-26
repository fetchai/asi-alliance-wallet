import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";
import { Text, View, ViewStyle } from "react-native";
import { Button } from "components/button";
import { ArrowDownGradientIcon } from "components/new/icon/arrow-down-gradient";
import { ArrowUpGradientIcon } from "components/new/icon/arrow-up-gradient";
import { useStyle } from "styles/index";
import { useStore } from "stores/index";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { EarnIcon } from "components/new/icon/earn-icon";

export const TokenBalanceSection: FunctionComponent<{
  totalNumber: string;
  totalDenom: string;
  totalPrice: string;
}> = observer(({ totalNumber, totalDenom, totalPrice }) => {
  const style = useStyle();
  const { chainStore, priceStore, analyticsStore } = useStore();
  const chainId = chainStore.current.chainId;
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  return (
    <View style={style.flatten(["flex-column", "margin-x-page"]) as ViewStyle}>
      <Text
        style={style.flatten(["color-gray-200", "text-caption2"]) as ViewStyle}
      >
        {"YOUR BALANCE"}
      </Text>
      <View style={style.flatten(["flex-row", "margin-top-8"]) as ViewStyle}>
        <Text
          style={
            style.flatten([
              "color-white",
              "h2",
              "font-normal",
              "items-center",
            ]) as ViewStyle
          }
        >
          {totalNumber}
        </Text>
        <Text
          style={
            style.flatten([
              "color-gray-400",
              "h2",
              "font-normal",
              "margin-left-8",
            ]) as ViewStyle
          }
        >
          {totalDenom}
        </Text>
      </View>
      {totalPrice ? (
        <View
          style={
            style.flatten([
              "flex-row",
              "items-center",
              "margin-y-8",
            ]) as ViewStyle
          }
        >
          <Text style={style.flatten(["color-gray-300", "body2"]) as ViewStyle}>
            {totalPrice}
          </Text>
          <Text
            style={
              style.flatten([
                "color-gray-300",
                "body2",
                "margin-left-6",
              ]) as ViewStyle
            }
          >
            {priceStore.defaultVsCurrency.toUpperCase()}
          </Text>
        </View>
      ) : null}

      {/*Buttons*/}
      <View
        style={
          style.flatten([
            "flex-row",
            "justify-evenly",
            "margin-y-16",
          ]) as ViewStyle
        }
      >
        <View style={style.flatten(["flex-1"]) as ViewStyle}>
          <Button
            text={"Receive"}
            rightIcon={<ArrowDownGradientIcon size={15} />}
            textStyle={
              style.flatten([
                "color-indigo-900",
                "margin-right-8",
                "body2",
              ]) as ViewStyle
            }
            containerStyle={
              style.flatten([
                "background-color-white",
                "border-radius-32",
                "margin-right-6",
              ]) as ViewStyle
            }
            onPress={() => {
              analyticsStore.logEvent("receive_click", {
                pageName: "Token Detail",
              });
              navigation.navigate("Others", {
                screen: "Receive",
                params: { chainId: chainId },
              });
            }}
          />
        </View>
        <View style={style.flatten(["flex-1"]) as ViewStyle}>
          <Button
            text={"Send"}
            rightIcon={<ArrowUpGradientIcon size={15} />}
            textStyle={
              style.flatten([
                "color-indigo-900",
                "margin-right-8",
                "body2",
              ]) as ViewStyle
            }
            containerStyle={
              style.flatten([
                "background-color-white",
                "border-radius-32",
                "margin-left-6",
              ]) as ViewStyle
            }
            onPress={() => {
              analyticsStore.logEvent("send_click", {
                pageName: "Token Detail",
              });
              navigation.navigate("Others", {
                screen: "Send",
                params: {
                  currency: chainStore.current.stakeCurrency.coinMinimalDenom,
                },
              });
            }}
          />
        </View>
      </View>
      <Button
        text={"Stake"}
        textStyle={
          style.flatten([
            "color-indigo-900",
            "margin-x-8",
            "body2",
          ]) as ViewStyle
        }
        rightIcon={<EarnIcon size={15} />}
        containerStyle={
          style.flatten([
            "background-color-white",
            "border-radius-32",
            "margin-bottom-16",
          ]) as ViewStyle
        }
        onPress={() => {
          analyticsStore.logEvent("stake_click", {
            chainId: chainStore.current.chainId,
            chainName: chainStore.current.chainName,
            pageName: "Token Detail",
          });
          navigation.navigate("Stake", {
            screen: "Staking.Dashboard",
            params: { isTab: false },
          });
        }}
      />
    </View>
  );
});
