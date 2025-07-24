import React, { FunctionComponent } from "react";
import { CardModal } from "modals/card";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { IconButton } from "components/new/button/icon";
import { RectButton } from "components/rect-button";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { ArrowUpIcon } from "../icon/arrow-up";
import { ArrowDownIcon } from "../icon/arrow-down";
import { NewBridgeIcon } from "../icon/new-bridge-icon";
import { Button } from "components/button";
import { useStore } from "stores/index";
import Toast from "react-native-toast-message";
import { txnTypeKey, txType } from "components/new/txn-status.tsx";

export enum QuickTabOptions {
  receive,
  send,
  bridge,
}

export const QuickTabOptionModel: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  onPress: (event: QuickTabOptions) => void;
}> = ({ close, isOpen, onPress }) => {
  const style = useStyle();
  const { analyticsStore, activityStore } = useStore();

  if (!isOpen) {
    return null;
  }

  return (
    <CardModal isOpen={isOpen} disableGesture={true} close={() => close()}>
      <BlurBackground
        borderRadius={12}
        blurIntensity={15}
        containerStyle={style.flatten(["margin-bottom-4"]) as ViewStyle}
      >
        <RectButton
          onPress={() => {
            if (activityStore.getPendingTxnTypes[txnTypeKey.send]) {
              Toast.show({
                type: "error",
                text1: `${txType[txnTypeKey.send]} in progress`,
              });
              close();
              return;
            }
            close();
            onPress(QuickTabOptions.send);
            analyticsStore.logEvent("send_click", {
              tabName: "fund_transfer_tab",
              pageName: "Home",
            });
          }}
          style={
            style.flatten([
              "border-radius-12",
              "flex-row",
              "items-center",
              "padding-y-18",
              "padding-x-12",
            ]) as ViewStyle
          }
          activeOpacity={0.5}
          underlayColor={style.flatten(["color-gray-50"]).color}
        >
          <IconButton
            backgroundBlur={false}
            icon={<ArrowUpIcon />}
            iconStyle={style.flatten(["padding-0"]) as ViewStyle}
          />
          <Text
            style={
              style.flatten([
                "body2",
                "color-white",
                "margin-left-18",
              ]) as ViewStyle
            }
          >
            Send
          </Text>
        </RectButton>
      </BlurBackground>
      <BlurBackground
        borderRadius={12}
        blurIntensity={15}
        containerStyle={style.flatten(["margin-bottom-4"]) as ViewStyle}
      >
        <RectButton
          onPress={() => {
            close();
            onPress(QuickTabOptions.receive);
            analyticsStore.logEvent("receive_click", {
              tabName: "fund_transfer_tab",
            });
          }}
          style={
            style.flatten([
              "border-radius-12",
              "flex-row",
              "items-center",
              "padding-y-18",
              "padding-x-12",
            ]) as ViewStyle
          }
          activeOpacity={0.5}
          underlayColor={style.flatten(["color-gray-50"]).color}
        >
          <IconButton
            backgroundBlur={false}
            icon={<ArrowDownIcon />}
            iconStyle={style.flatten(["padding-0"]) as ViewStyle}
          />
          <Text
            style={
              style.flatten([
                "body2",
                "color-white",
                "margin-left-18",
              ]) as ViewStyle
            }
          >
            Receive
          </Text>
        </RectButton>
      </BlurBackground>
      <BlurBackground
        borderRadius={12}
        blurIntensity={15}
        containerStyle={style.flatten(["margin-bottom-4"]) as ViewStyle}
      >
        <RectButton
          onPress={() => {
            return;
            // close();
            // onPress(QuickTabOptions.bridge);
          }}
          style={
            style.flatten([
              "border-radius-12",
              "flex-row",
              "items-center",
              "padding-y-18",
              "padding-x-12",
              "justify-between",
            ]) as ViewStyle
          }
          activeOpacity={1}
          underlayColor={"rgba(255,255,255,0)"}
          rippleColor={"rgba(255,255,255,0)"}
        >
          <View
            style={style.flatten(["flex-row", "items-center"]) as ViewStyle}
          >
            <IconButton
              backgroundBlur={false}
              icon={<NewBridgeIcon color={"#64646D"} />}
              iconStyle={style.flatten(["padding-0"]) as ViewStyle}
            />
            <Text
              style={
                style.flatten([
                  "body2",
                  "color-gray-400",
                  "margin-left-18",
                ]) as ViewStyle
              }
            >
              Bridge
            </Text>
          </View>
          <Button
            text="COMING SOON"
            size="small"
            rippleColor={"rgba(255,255,255,0)"}
            containerStyle={
              style.flatten([
                "background-color-indigo",
                "border-radius-4",
                "height-24",
              ]) as ViewStyle
            }
            textStyle={style.flatten([
              "text-caption2",
              "color-white",
              "font-bold",
            ])}
          />
        </RectButton>
      </BlurBackground>
    </CardModal>
  );
};
