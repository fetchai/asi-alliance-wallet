import React, { FunctionComponent, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ViewStyle } from "react-native";
import moment from "moment";
import { getActivityIcon, getDetails } from "utils/stable-sort";
import { useStore } from "stores/index";
import { useStyle } from "styles/index";
import { IconButton } from "components/new/button/icon";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { AsiIcon } from "components/new/icon/asi-icon";

export const ActivityRow: FunctionComponent<{
  node: any;
  setDate: any;
}> = ({ node, setDate }) => {
  const style = useStyle();
  const { chainStore, analyticsStore } = useStore();
  const [isAmountDeducted, setIsAmountDeducted] = useState(false);

  useEffect(() => {
    setIsAmountDeducted(isAmountDeducted);
  }, [isAmountDeducted]);

  useEffect(() => {
    const details = getDetails(node, chainStore);
    const currentDate = moment(details.timestamp)
      .utc()
      .format("MMMM DD, hh:mm A");
    setDate(currentDate);
  }, [node, setDate]);
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const details = getDetails(node, chainStore);

  return (
    <TouchableOpacity
      style={style.flatten(["flex-row", "items-center"]) as ViewStyle}
      onPress={() => {
        navigation.navigate("Others", {
          screen: "ActivityDetails",
          params: {
            id: node.id,
          },
        });
        analyticsStore.logEvent("activity_transactions_click", {
          tabName: "Transactions",
          pageName: "Activity",
        });
      }}
    >
      <View
        style={
          style.flatten([
            "flex-row",
            "margin-left-16",
            "margin-right-8",
          ]) as ViewStyle
        }
      >
        <View
          style={
            style.flatten([
              "width-32",
              "height-32",
              "items-center",
              "justify-center",
              "absolute",
            ]) as ViewStyle
          }
        >
          <AsiIcon size={25} />
        </View>
        <View
          style={
            style.flatten([
              "border-radius-64",
              "background-color-indigo-900",
              "margin-left-16",
            ]) as ViewStyle
          }
        >
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
        </View>
      </View>
      <View style={style.flatten(["flex-4"]) as ViewStyle}>
        <Text
          style={
            style.flatten([
              "body3",
              "padding-4",
              "color-white",
              "font-medium",
            ]) as ViewStyle
          }
        >
          {details.verb}
        </Text>
        <Text
          style={
            style.flatten([
              "body3",
              "padding-2",
              "color-white@60%",
              "font-medium",
            ]) as ViewStyle
          }
        >
          {node.transaction.status === "Success" ? (
            <React.Fragment>
              Confirmed • {moment(details.timestamp).format("hh:mm A")}
            </React.Fragment>
          ) : node.transaction.status === "Pending" ? (
            <Text style={style.flatten(["color-white@60%", "h7"]) as ViewStyle}>
              Pending
            </Text>
          ) : (
            <Text style={style.flatten(["color-white@60%", "h7"]) as ViewStyle}>
              Error
            </Text>
          )}
        </Text>
      </View>

      <View
        style={
          style.flatten([
            "flex-3",
            "flex-row",
            "flex-wrap",
            "margin-right-16",
            "justify-end",
          ]) as ViewStyle
        }
      >
        <Text
          style={
            style.flatten([
              "body3",
              "font-medium",
              details.verb == "Received"
                ? "color-vibrant-green-500"
                : "color-white@60%",
            ]) as ViewStyle
          }
        >
          {details.amountNumber}
        </Text>
        <Text
          style={
            style.flatten([
              "body3",
              "font-medium",
              "color-white@60%",
              "margin-left-4",
            ]) as ViewStyle
          }
        >
          {details.amountAlphabetic}
        </Text>
      </View>
    </TouchableOpacity>
  );
};
