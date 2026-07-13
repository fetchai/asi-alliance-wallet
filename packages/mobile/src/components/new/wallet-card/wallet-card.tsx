import React, { FunctionComponent } from "react";
import { CardModal } from "modals/card";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { IconButton } from "components/new/button/icon";
import { EditIcon } from "../icon/edit";
import { DeleteIcon } from "../icon/color-delete";
import { RectButton } from "components/rect-button";
import { BlurBackground } from "components/new/blur-background/blur-background";

export enum ManageWalletOption {
  renameWallet,
  deleteWallet,
}

export const WalletCardModel: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  title: string;
  accountName: string;
  onSelectWallet: (option: ManageWalletOption) => void;
}> = ({ close, title, isOpen, onSelectWallet, accountName }) => {
  const style = useStyle();

  if (!isOpen) {
    return null;
  }

  return (
    <CardModal title={title} isOpen={isOpen} close={() => close()}>
      <BlurBackground
        borderRadius={12}
        backgroundBlur={false}
        containerStyle={
          style.flatten([
            "margin-bottom-6",
            "background-color-gray-5",
          ]) as ViewStyle
        }
      >
        <RectButton
          onPress={() => {
            close();
            onSelectWallet(ManageWalletOption.renameWallet);
          }}
          style={style.flatten(["border-radius-12"]) as ViewStyle}
          activeOpacity={0.5}
          underlayColor={"#e0fedd"}
        >
          <View
            style={
              style.flatten([
                "flex-row",
                "items-center",
                "padding-18",
              ]) as ViewStyle
            }
          >
            <IconButton
              backgroundBlur={false}
              icon={<EditIcon size={16} color="black" />}
              iconStyle={style.flatten(["padding-0"]) as ViewStyle}
            />
            <Text
              style={
                style.flatten([
                  "body3",
                  "color-dark",
                  "margin-left-18",
                ]) as ViewStyle
              }
            >
              Rename wallet
            </Text>
          </View>
        </RectButton>
      </BlurBackground>
      <BlurBackground
        borderRadius={12}
        backgroundBlur={false}
        containerStyle={
          style.flatten([
            "margin-bottom-6",
            "background-color-gray-5",
          ]) as ViewStyle
        }
      >
        <RectButton
          onPress={() => {
            close();
            onSelectWallet(ManageWalletOption.deleteWallet);
          }}
          style={style.flatten(["border-radius-12"]) as ViewStyle}
          activeOpacity={0.5}
          underlayColor={"#e0fedd"}
        >
          <View
            style={
              style.flatten([
                "flex-row",
                "items-center",
                "padding-18",
              ]) as ViewStyle
            }
          >
            <IconButton
              backgroundBlur={false}
              icon={<DeleteIcon size={16} color="black" />}
              iconStyle={style.flatten(["padding-0"]) as ViewStyle}
            />
            <Text
              style={
                style.flatten([
                  "body3",
                  "color-dark",
                  "margin-left-18",
                  "color-red-400",
                ]) as ViewStyle
              }
            >
              {`Delete ${accountName}`}
            </Text>
          </View>
        </RectButton>
      </BlurBackground>
    </CardModal>
  );
};
