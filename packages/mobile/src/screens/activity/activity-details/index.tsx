import React, { useEffect, useState } from "react";
import { Text, View, ViewStyle } from "react-native";
import moment from "moment";
import { DetailRows } from "screens/activity/activity-details/details-rows";
import { useStyle } from "styles/index";
import { RouteProp, useRoute } from "@react-navigation/native";
import { PageWithScrollView } from "components/page";
import { useStore } from "stores/index";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { formatAddress, formatToTruncated } from "utils/format/format";
import { LeftRightCrossIcon } from "components/new/icon/left-right-cross";
import { IconButton } from "components/new/button/icon";
import { getActivityIcon, getDetails } from "utils/stable-sort";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { TimelineView } from "components/new/timeline";
import { BlurButton } from "components/new/button/blur-button";
import { observer } from "mobx-react-lite";
import { AsiIcon } from "components/new/icon/asi-icon";

export const ActivityDetails = observer(() => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          id: any;
        }
      >,
      any
    >
  >();

  const nodeId = route.params.id;
  const style = useStyle();
  const { priceStore, chainStore, activityStore } = useStore();
  const node = activityStore.getNode(nodeId);
  const details = getDetails(node, chainStore);
  const [usdValue, setUsdValue] = useState<any>("$0");
  const fiatCurrency = details.fiatCurrency;
  const currency = {
    coinDenom: "FET",
    coinMinimalDenom: "afet",
    coinDecimals: 18,
    coinGeckoId: "fetch-ai",
  };

  useEffect(() => {
    if (details.amt) {
      const amountInNumber = parseFloat(
        details.amt.amount
          ? details.amt.amount
          : details.amt[0]?.amount
          ? details.amt[0].amount
          : "0"
      );
      const inputValue = new CoinPretty(currency, new Int(amountInNumber));
      const inputValueInUsd = convertTofiatCurrency(inputValue);
      setUsdValue(inputValueInUsd);
    }
  }, []);

  const convertTofiatCurrency = (currency: CoinPretty) => {
    const value = priceStore.calculatePrice(currency, fiatCurrency);
    return value && value.shrink(true).maxDecimals(6).toString();
  };

  const toAddress = (details: {
    toAddress: any;
    validatorAddress: any;
    validatorDstAddress: any;
    verb: string;
    receiver: any;
  }) => {
    switch (true) {
      case Boolean(details.toAddress):
        return formatAddress(details.toAddress);
      case Boolean(details.validatorAddress):
        return formatToTruncated(details.validatorAddress);
      case Boolean(details.validatorDstAddress):
        return formatToTruncated(details.validatorDstAddress);
      case details.verb == "IBC transfer":
        return formatAddress(details.receiver);
      default:
        return "";
    }
  };

  return (
    <PageWithScrollView backgroundMode={"image"}>
      <View style={style.flatten(["items-center"]) as ViewStyle}>
        <View
          style={
            style.flatten([
              "padding-16",
              "border-radius-64",
              "background-color-white",
            ]) as ViewStyle
          }
        >
          <AsiIcon size={25} />
        </View>
        <Text
          style={
            style.flatten([
              "color-white",
              "h3",
              "font-normal",
              "margin-top-10",
            ]) as ViewStyle
          }
        >
          {details.verb}
        </Text>
        <BlurButton
          text={
            details.status === "Success"
              ? "Confirmed"
              : details.status === "Pending"
              ? "Pending"
              : "Error"
          }
          backgroundBlur={false}
          textStyle={
            [
              style.flatten(
                ["text-caption2"],
                [
                  details.status === "Success" || details.status === "Pending"
                    ? "color-indigo-900"
                    : "color-white",
                ]
              ),
              { lineHeight: 14 },
            ] as ViewStyle
          }
          containerStyle={
            style.flatten(
              ["padding-x-12", "margin-y-8"],
              [
                details.status === "Success"
                  ? "background-color-vibrant-green-500"
                  : details.status === "Pending"
                  ? "background-color-yellow-500"
                  : "background-color-vibrant-red-500",
              ]
            ) as ViewStyle
          }
        />
        <Text style={style.flatten(["color-gray-200", "body2"]) as ViewStyle}>
          {moment(details.timestamp).format("MMMM DD, hh:mm A")}
        </Text>
      </View>
      <View style={style.flatten(["margin-y-16"]) as ViewStyle}>
        {details.verb === "Smart Contract Interaction" ? (
          <BlurBackground
            borderRadius={12}
            blurIntensity={15}
            containerStyle={
              style.flatten(["margin-12", "padding-16"]) as ViewStyle
            }
          >
            <TimelineView
              data={[
                {
                  icon: (
                    <IconButton
                      icon={<LeftRightCrossIcon size={20} />}
                      backgroundBlur={true}
                      iconStyle={
                        style.flatten([
                          "width-32",
                          "height-32",
                          "items-center",
                          "justify-center",
                        ]) as ViewStyle
                      }
                    />
                  ),
                  leadingSubtitle: "Smart Contract",
                  trailingTitle: `${details.amountNumber} ${details.amountAlphabetic}`,
                  trailingSubtitle: usdValue,
                },
              ]}
            />
          </BlurBackground>
        ) : (
          <BlurBackground
            borderRadius={12}
            blurIntensity={15}
            containerStyle={
              style.flatten(["margin-12", "padding-16"]) as ViewStyle
            }
          >
            <TimelineView
              trailingTitleStyle={
                style.flatten([
                  details.verb == "Received"
                    ? "color-green-400"
                    : "color-white",
                ]) as ViewStyle
              }
              data={[
                {
                  icon: (
                    <IconButton
                      icon={getActivityIcon("")}
                      backgroundBlur={true}
                      iconStyle={
                        style.flatten([
                          "width-32",
                          "height-32",
                          "items-center",
                          "justify-center",
                        ]) as ViewStyle
                      }
                    />
                  ),
                  leadingTitle: details.signerAddress
                    ? "From"
                    : "Delegator Address",
                  leadingSubtitle: formatAddress(
                    details.signerAddress
                      ? details.signerAddress
                      : details.deligatorAddress
                  ),
                },
                {
                  icon: (
                    <IconButton
                      icon={getActivityIcon(details.verb)}
                      backgroundBlur={true}
                      iconStyle={
                        style.flatten([
                          "width-32",
                          "height-32",
                          "items-center",
                          "justify-center",
                        ]) as ViewStyle
                      }
                    />
                  ),
                  leadingTitle: details.toAddress
                    ? "To"
                    : details.verb == "IBC transfer"
                    ? "Receiver"
                    : "Validator address",
                  leadingSubtitle: toAddress(details),
                  trailingTitle: `${details.amountNumber} ${details.amountAlphabetic}`,
                  trailingSubtitle: usdValue != "$0" ? usdValue : undefined,
                },
              ]}
            />
          </BlurBackground>
        )}
      </View>
      <DetailRows details={details} />
    </PageWithScrollView>
  );
});
