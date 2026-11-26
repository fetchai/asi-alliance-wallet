import React, { FunctionComponent } from "react";
import {
  FlatList,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useStyle } from "styles/index";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { ValidatorThumbnail } from "components/thumbnail";
import { titleCase } from "utils/format/format";
import { VectorCharacter } from "components/vector-character";

interface ItemData {
  title: string;
  value: string;
}

export const StakeValidatorCardView: FunctionComponent<{
  trailingIcon?: any;
  thumbnailUrl?: any;
  heading: string | undefined;
  validatorAddress: string;
  votingpower?: string;
  delegated?: string;
  commission?: string;
  status?: string;
  apr?: string;
  containerStyle?: ViewStyle;
  onPress?: () => void;
  onExplorerPress?: () => void;
}> = ({
  trailingIcon,
  thumbnailUrl,
  heading,
  validatorAddress,
  containerStyle,
  onPress,
  onExplorerPress,
  delegated,
  commission,
  status,
  apr,
}) => {
  const style = useStyle();

  const data: ItemData[] = [
    {
      title: "Delegated",
      value: delegated && delegated !== "NaN" ? delegated : "NA",
    },
    {
      title: "Commission",
      value: commission && commission !== "NaN" ? commission : "NA",
    },
    {
      title: "Status",
      value: status && status !== "NaN" ? titleCase(status) : "NA",
    },
    {
      title: "APR",
      value: apr && apr !== "NaN" ? apr : "NA",
    },
  ];

  return (
    <TouchableOpacity
      activeOpacity={onPress == undefined ? 1 : 0.6}
      onPress={onPress}
    >
      <BlurBackground
        borderRadius={12}
        blurIntensity={16}
        containerStyle={
          [style.flatten(["padding-18"]), containerStyle] as ViewStyle
        }
      >
        <View style={style.flatten(["flex-row", "items-center"]) as ViewStyle}>
          <View
            style={
              style.flatten(["flex-row", "flex-3", "items-center"]) as ViewStyle
            }
          >
            {thumbnailUrl || heading === undefined ? (
              <ValidatorThumbnail
                style={style.flatten(["margin-right-12"]) as ViewStyle}
                size={32}
                url={thumbnailUrl}
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
                    "margin-right-12",
                  ]) as ViewStyle
                }
              >
                <VectorCharacter char={heading[0]} color="white" height={12} />
              </BlurBackground>
            )}
            <View>
              <Text
                style={style.flatten(["subtitle2", "color-white"]) as ViewStyle}
              >
                {heading}
              </Text>

              <Text
                style={
                  style.flatten([
                    "text-caption2",
                    "color-white@80%",
                    "margin-y-2",
                  ]) as ViewStyle
                }
              >
                {Bech32Address.shortenAddress(validatorAddress, 20)}
              </Text>
            </View>
          </View>
          <View style={style.flatten(["flex-1", "items-end"]) as ViewStyle}>
            {trailingIcon}
          </View>
        </View>
        <View
          style={
            style.flatten([
              "height-1",
              "background-color-white@20%",
              "margin-y-16",
            ]) as ViewStyle
          }
        />
        <FlatList
          data={data}
          scrollEnabled={false}
          horizontal={true}
          contentContainerStyle={
            style.flatten([
              "width-full",
              "justify-between",
              "flex-wrap",
            ]) as ViewStyle
          }
          renderItem={({ item, index }: { item: ItemData; index: number }) => {
            return (
              <View
                key={index}
                style={style.flatten(["margin-right-6"]) as ViewStyle}
              >
                <Text
                  style={
                    style.flatten(["body3", "color-white@60%"]) as ViewStyle
                  }
                >
                  {item.title}
                </Text>
                <Text
                  style={style.flatten(["color-white", "body3"]) as ViewStyle}
                >
                  {item.value}
                </Text>
              </View>
            );
          }}
          keyExtractor={(_item, index) => index.toString()}
        />
        <TouchableOpacity
          style={style.flatten(["margin-top-15", "padding-y-1"]) as ViewStyle}
          onPress={onExplorerPress}
        >
          <Text
            style={
              style.flatten([
                "color-indigo-250",
                "text-caption2",
                "font-bold",
              ]) as ViewStyle
            }
          >
            View in explorer
          </Text>
        </TouchableOpacity>
      </BlurBackground>
    </TouchableOpacity>
  );
};
