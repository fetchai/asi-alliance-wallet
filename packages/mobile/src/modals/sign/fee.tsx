import React, { FunctionComponent, useState } from "react";
import { observer } from "mobx-react-lite";
import { IFeeConfig, IGasConfig } from "@keplr-wallet/hooks";
import { Text, View, ViewStyle } from "react-native";
import { useStore } from "stores/index";
import { useStyle } from "styles/index";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import { KeplrSignOptions } from "@keplr-wallet/types";
import { IconButton } from "components/new/button/icon";
import { GearIcon } from "components/new/icon/gear-icon";
import { TransactionFeeModel } from "components/new/fee-modal/transection-fee-modal";

export const FeeInSign: FunctionComponent<{
  isInternal: boolean;

  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;

  signOptions?: KeplrSignOptions;
}> = observer(({ isInternal, signOptions, feeConfig, gasConfig }) => {
  const { chainStore, priceStore } = useStore();

  const style = useStyle();

  const [showFeeModal, setFeeModal] = useState(false);

  const preferNoSetFee = signOptions?.preferNoSetFee ?? false;

  const fee =
    feeConfig.fee ??
    new CoinPretty(
      chainStore.getChain(feeConfig.chainId).stakeCurrency,
      new Dec("0")
    );
  const price = priceStore.calculatePrice(fee);

  const isEvm = chainStore.current.features?.includes("evm") ?? false;

  // If the signing request is from internal and the "preferNoSetFee" option is set,
  // prevent the user to edit the fee.
  const canFeeEditable = !isInternal || !preferNoSetFee;
  return (
    <React.Fragment>
      {feeConfig.feeType && canFeeEditable ? (
        <React.Fragment>
          <View
            style={
              style.flatten([
                "flex-row",
                "justify-between",
                "items-center",
                "margin-y-12",
              ]) as ViewStyle
            }
          >
            <Text
              style={style.flatten(["body3", "color-white@60%"]) as ViewStyle}
            >
              Transaction fee:
            </Text>
            <View
              style={style.flatten(["flex-row", "items-center"]) as ViewStyle}
            >
              <Text
                style={
                  style.flatten([
                    "body3",
                    "color-white",
                    "margin-right-6",
                  ]) as ViewStyle
                }
              >
                {feeConfig
                  .getFeeTypePretty(
                    feeConfig.feeType ? feeConfig.feeType : "average"
                  )
                  .hideIBCMetadata(true)
                  .trim(true)
                  .toMetricPrefix(isEvm)}
              </Text>
              <IconButton
                backgroundBlur={false}
                icon={<GearIcon />}
                iconStyle={
                  style.flatten([
                    "width-32",
                    "height-32",
                    "items-center",
                    "justify-center",
                    "border-width-1",
                    "border-color-white@40%",
                  ]) as ViewStyle
                }
                onPress={() => setFeeModal(true)}
              />
            </View>
          </View>
          {feeConfig.error ? (
            <Text
              style={
                style.flatten([
                  "text-caption1",
                  "color-red-250",
                  "margin-top-8",
                ]) as ViewStyle
              }
            >
              {feeConfig.error.message == "insufficient fee"
                ? "Insufficient available balance for transaction fee"
                : feeConfig.error.message}
            </Text>
          ) : null}
        </React.Fragment>
      ) : (
        <View style={style.flatten(["padding-bottom-28"]) as ViewStyle}>
          <View
            style={
              style.flatten([
                "flex-row",
                "items-center",
                "margin-bottom-4",
              ]) as ViewStyle
            }
          >
            <Text
              style={
                style.flatten([
                  "padding-y-4",
                  "color-gray-200",
                  "margin-y-4",
                ]) as ViewStyle
              }
            >
              Fee
            </Text>
            <View style={style.get("flex-1")} />
            <Text
              style={style.flatten(["body3", "color-text-low"]) as ViewStyle}
            >
              {price ? price.toString() : "-"}
            </Text>
          </View>
          <View style={style.flatten(["flex-row"])}>
            <View style={style.get("flex-1")} />
            <Text
              style={
                style.flatten(["subtitle1", "color-gray-300"]) as ViewStyle
              }
            >
              {fee.trim(true).toString()}
            </Text>
          </View>
        </View>
      )}
      <TransactionFeeModel
        isOpen={showFeeModal}
        close={() => setFeeModal(false)}
        title={"Transaction fee"}
        feeConfig={feeConfig}
        gasConfig={gasConfig}
        feeButtonInner={true}
      />
    </React.Fragment>
  );
});
