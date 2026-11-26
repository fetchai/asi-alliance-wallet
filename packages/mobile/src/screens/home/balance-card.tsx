import { PricePretty } from "@keplr-wallet/unit";
import { AnimatedNumber } from "components/new/animations/animated-number";
import React, { FunctionComponent } from "react";
import { Text, View, ViewStyle } from "react-native";
import Skeleton from "react-native-reanimated-skeleton";
import { useStore } from "stores/index";
import { useStyle } from "styles/index";

export const BalanceCard: FunctionComponent<{
  loading: boolean;
  totalPrice: PricePretty | undefined;
  totalNumber: any;
  totalDenom: any;
}> = ({ loading, totalPrice, totalNumber, totalDenom }) => {
  const style = useStyle();
  const { priceStore } = useStore();

  return (
    <Skeleton
      isLoading={loading}
      containerStyle={
        style.flatten([
          "margin-top-32",
          "justify-center",
          "width-full",
          "items-center",
        ]) as ViewStyle
      }
      layout={[
        {
          key: "totalBalance",
          width: "75%",
          height: 32,
          marginBottom: 6,
        },
        {
          key: "usdBalance",
          width: totalPrice ? "50%" : 0,
          height: 20,
          marginBottom: 6,
        },
      ]}
      boneColor={style.get("color-white@20%").color}
      highlightColor={style.get("color-white@60%").color}
    >
      <View
        style={
          style.flatten([
            "flex-row",
            "justify-center",
            "width-full",
            "items-center",
            "flex-wrap",
          ]) as ViewStyle
        }
      >
        <AnimatedNumber
          numberForAnimated={parseFloat(totalNumber)}
          includeComma={true}
          decimalAmount={2}
          gap={0}
          colorValue={"white"}
          fontSizeValue={32}
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
                "h1",
                "color-new-gray-700",
                "margin-left-8",
                "font-normal",
              ]),
              { lineHeight: 35 },
            ] as ViewStyle
          }
        >
          {totalDenom}
        </Text>
      </View>
      <View style={style.flatten(["flex-row", "margin-y-6"]) as ViewStyle}>
        <Text
          style={
            style.flatten([
              "color-white@60%",
              "body2",
              "width-full",
              "text-center",
            ]) as ViewStyle
          }
        >
          {totalPrice &&
            ` ${totalPrice.toString()} ${priceStore.defaultVsCurrency.toUpperCase()}`}
        </Text>
      </View>
    </Skeleton>
  );
};
