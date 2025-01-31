import React, { FunctionComponent, useState } from "react";
import { observer } from "mobx-react-lite";
import { Text, TouchableOpacity, View, ViewStyle } from "react-native";
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
import { BlurBackground } from "components/new/blur-background/blur-background";
import { LockIcon } from "components/new/icon/lock";
import { ChevronDownIcon } from "components/new/icon/chevron-down";
import { ChevronUpIcon } from "components/new/icon/chevron-up";
import { ExternalLinkIcon } from "components/new/icon/external-link";
import { SlideDownAnimation } from "components/new/animations/slide-down";
import {
  getEnumKeyByEnumValue,
  isVestingExpired,
  removeTrailingZeros,
  separateNumericAndDenom,
} from "utils/format/format";
import { VestingType } from "@keplr-wallet/stores";
import { convertEpochToDate } from "utils/format/date";
import { clearDecimals } from "modals/sign/messages";
import { useSmartNavigation } from "navigation/smart-navigation";

export const TokenBalanceSection: FunctionComponent<{
  totalNumber: string;
  totalDenom: string;
  totalPrice: string;
}> = observer(({ totalNumber, totalDenom, totalPrice }) => {
  const style = useStyle();
  const smartNavigation = useSmartNavigation();
  const { accountStore, chainStore, priceStore, analyticsStore, queriesStore } =
    useStore();
  const chainId = chainStore.current.chainId;
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const queries = queriesStore.get(chainId);
  const accountInfo = accountStore.getAccount(chainId);

  const isVesting = queries.cosmos.queryAccount.getQueryBech32Address(
    accountInfo.bech32Address
  ).isVestingAccount;

  const vestingInfo = queries.cosmos.queryAccount.getQueryBech32Address(
    accountInfo.bech32Address
  ).vestingAccount;
  const latestBlockTime = queries.cosmos.queryRPCStatus.latestBlockTime;

  const vestingEndTimeStamp = Number(
    vestingInfo.base_vesting_account?.end_time
  );
  const vestingStartTimeStamp = Number(vestingInfo.start_time);

  const spendableBalances =
    queries.cosmos.querySpendableBalances.getQueryBech32Address(
      accountInfo.bech32Address
    );

  const { numericPart: spendableNumber, denomPart: _spendableDenom } =
    separateNumericAndDenom(spendableBalances.balances.toString());

  function getVestingBalance(balance: number) {
    return clearDecimals((balance / 10 ** 18).toFixed(20).toString());
  }

  const getOriginalVestingBalance = () =>
    vestingInfo.base_vesting_account
      ? getVestingBalance(
          Number(vestingInfo.base_vesting_account?.original_vesting[0].amount)
        )
      : "0";

  const getVestedBalance = () =>
    getVestingBalance(
      Number(getOriginalVestingBalance()) - Number(vestingBalance())
    ).toString();
  const vestingBalance = () => {
    if (vestingInfo["@type"] == VestingType.Continuous.toString()) {
      if (totalNumber > clearDecimals(spendableNumber)) {
        return getVestingBalance(
          Number(totalNumber) - Number(clearDecimals(spendableNumber))
        ).toString();
      } else if (
        latestBlockTime &&
        vestingEndTimeStamp > latestBlockTime &&
        clearDecimals(spendableNumber) === totalNumber
      ) {
        const ov = Number(
          vestingInfo.base_vesting_account?.original_vesting[0].amount
        );
        const vested =
          ov *
          ((latestBlockTime - vestingStartTimeStamp) /
            (vestingEndTimeStamp - vestingStartTimeStamp));
        return getVestingBalance(ov - vested);
      }

      return "0";
    }
    return getOriginalVestingBalance();
  };

  const [showCalendar, setShowCalendar] = useState(false);

  return (
    <View style={style.flatten(["flex-column", "margin-x-page"]) as ViewStyle}>
      <View style={style.flatten(["margin-bottom-24"]) as ViewStyle}>
        <Text
          style={
            style.flatten([
              "color-white@60%",
              "text-caption2",
              "font-medium",
            ]) as ViewStyle
          }
        >
          {"YOUR BALANCE"}
        </Text>
        <View
          style={
            style.flatten([
              "flex-row",
              "margin-top-6",
              "flex-wrap",
            ]) as ViewStyle
          }
        >
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
            {Number(removeTrailingZeros(totalNumber)).toLocaleString("en-US")}
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
                "margin-top-6",
              ]) as ViewStyle
            }
          >
            <Text
              style={style.flatten(["color-gray-300", "body2"]) as ViewStyle}
            >
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
      </View>
      {/* banner */}

      {isVesting && !isVestingExpired(vestingEndTimeStamp) && (
        <BlurBackground
          borderRadius={12}
          blurIntensity={16}
          containerStyle={
            style.flatten(["padding-18", "margin-bottom-24"]) as ViewStyle
          }
        >
          <View style={style.flatten(["flex-row"]) as ViewStyle}>
            <View style={[style.flatten(["margin-right-12"])] as ViewStyle}>
              <LockIcon size={13} />
            </View>
            <View style={style.flatten(["flex-1"]) as ViewStyle}>
              <Text
                style={style.flatten(["body2", "color-white"]) as ViewStyle}
              >
                {`Your balance includes ${removeTrailingZeros(
                  vestingBalance()
                )} ${totalDenom} that are still locked due to your vesting schedule`}
              </Text>
              <View
                style={
                  style.flatten(["margin-top-12", "flex-row"]) as ViewStyle
                }
              >
                <TouchableOpacity
                  onPress={() => setShowCalendar(!showCalendar)}
                  style={
                    style.flatten(["flex-row", "items-center"]) as ViewStyle
                  }
                >
                  <Text
                    style={
                      [
                        style.flatten(["color-indigo-250", "text-caption2"]),
                        { lineHeight: 15 },
                      ] as ViewStyle
                    }
                  >
                    {!showCalendar ? "View calendar" : "Hide calendar"}
                  </Text>
                  <View style={style.flatten(["margin-left-6"]) as ViewStyle}>
                    {!showCalendar ? (
                      <ChevronDownIcon color="#BFAFFD" size={12} />
                    ) : (
                      <ChevronUpIcon color="#BFAFFD" size={12} />
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    smartNavigation.navigateSmart("WebView", {
                      url: "https://docs.cosmos.network/v0.45/modules/auth/05_vesting.html",
                    })
                  }
                  style={
                    style.flatten([
                      "flex-row",
                      "items-center",
                      "margin-left-12",
                    ]) as ViewStyle
                  }
                >
                  <Text
                    style={
                      [
                        style.flatten(["color-indigo-250", "text-caption2"]),
                        { lineHeight: 15 },
                      ] as ViewStyle
                    }
                  >
                    Learn more
                  </Text>
                  <View style={style.flatten(["margin-left-6"]) as ViewStyle}>
                    <ExternalLinkIcon color="#BFAFFD" size={12} />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {showCalendar && (
            <View style={style.flatten(["margin-top-32"]) as ViewStyle}>
              <SlideDownAnimation>
                <View
                  style={
                    style.flatten(["flex-row", "margin-bottom-12"]) as ViewStyle
                  }
                >
                  <Text
                    style={
                      style.flatten([
                        "color-white@60%",
                        "body3",
                        "margin-bottom-4",
                        "flex-2",
                      ]) as ViewStyle
                    }
                  >
                    Vesting type
                  </Text>
                  <Text
                    style={
                      style.flatten([
                        "color-white",
                        "body3",
                        "flex-3",
                        "text-right",
                      ]) as ViewStyle
                    }
                  >
                    {`${getEnumKeyByEnumValue(
                      vestingInfo["@type"] ?? VestingType.Continuous.toString(),
                      VestingType
                    )} Vesting`}
                  </Text>
                </View>
                {vestingInfo["@type"] == VestingType.Continuous.toString() && (
                  <View
                    style={
                      style.flatten([
                        "flex-row",
                        "margin-bottom-12",
                      ]) as ViewStyle
                    }
                  >
                    <Text
                      style={
                        style.flatten([
                          "color-white@60%",
                          "body3",
                          "margin-bottom-4",
                          "flex-2",
                        ]) as ViewStyle
                      }
                    >
                      Start time
                    </Text>
                    <Text
                      style={
                        style.flatten([
                          "color-white",
                          "body3",
                          "flex-3",
                          "text-right",
                        ]) as ViewStyle
                      }
                    >
                      {convertEpochToDate(
                        vestingStartTimeStamp,
                        "DD MMM YYYY hh:mm A"
                      )}
                    </Text>
                  </View>
                )}
                <View
                  style={
                    style.flatten(["flex-row", "margin-bottom-12"]) as ViewStyle
                  }
                >
                  <Text
                    style={
                      style.flatten([
                        "color-white@60%",
                        "body3",
                        "margin-bottom-4",
                        "flex-2",
                      ]) as ViewStyle
                    }
                  >
                    End time
                  </Text>
                  <Text
                    style={
                      style.flatten([
                        "color-white",
                        "body3",
                        "flex-3",
                        "text-right",
                      ]) as ViewStyle
                    }
                  >
                    {convertEpochToDate(
                      vestingEndTimeStamp,
                      "DD MMM YYYY hh:mm A"
                    )}
                  </Text>
                </View>
                <View
                  style={
                    style.flatten(
                      ["flex-row", "items-center"],
                      [
                        vestingInfo["@type"] ==
                          VestingType.Continuous.toString() &&
                          "margin-bottom-12",
                      ]
                    ) as ViewStyle
                  }
                >
                  <View style={style.flatten(["flex-2"]) as ViewStyle}>
                    <Text
                      style={
                        style.flatten([
                          "color-white@60%",
                          "body3",
                          "margin-bottom-4",
                        ]) as ViewStyle
                      }
                    >
                      {"Originally\nlocked"}
                    </Text>
                  </View>
                  <View
                    style={
                      style.flatten([
                        "flex-3",
                        "flex-row",
                        "justify-end",
                        "flex-wrap",
                      ]) as ViewStyle
                    }
                  >
                    <Text
                      style={
                        style.flatten([
                          "color-white",
                          "body3",
                          "text-right",
                        ]) as ViewStyle
                      }
                    >
                      {getOriginalVestingBalance()}
                    </Text>
                    <Text
                      style={
                        style.flatten([
                          "color-white@60%",
                          "body3",
                          "margin-left-4",
                        ]) as ViewStyle
                      }
                    >
                      {totalDenom}
                    </Text>
                  </View>
                </View>
                {vestingInfo["@type"] == VestingType.Continuous.toString() && (
                  <React.Fragment>
                    <View
                      style={
                        style.flatten([
                          "flex-row",
                          "items-center",
                          "margin-bottom-12",
                        ]) as ViewStyle
                      }
                    >
                      <View style={style.flatten(["flex-2"]) as ViewStyle}>
                        <Text
                          style={
                            style.flatten([
                              "color-white@60%",
                              "body3",
                              "margin-bottom-4",
                            ]) as ViewStyle
                          }
                        >
                          {"Currently\nlocked"}
                        </Text>
                      </View>
                      <View
                        style={
                          style.flatten([
                            "flex-3",
                            "flex-row",
                            "justify-end",
                            "flex-wrap",
                          ]) as ViewStyle
                        }
                      >
                        <Text
                          style={
                            style.flatten([
                              "color-white",
                              "body3",
                              "text-right",
                            ]) as ViewStyle
                          }
                        >
                          {vestingBalance().toString()}
                        </Text>
                        <Text
                          style={
                            style.flatten([
                              "color-white@60%",
                              "body3",
                              "margin-left-4",
                            ]) as ViewStyle
                          }
                        >
                          {totalDenom}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={
                        style.flatten(["flex-row", "items-center"]) as ViewStyle
                      }
                    >
                      <View style={style.flatten(["flex-2"]) as ViewStyle}>
                        <Text
                          style={
                            style.flatten([
                              "color-white@60%",
                              "body3",
                              "margin-bottom-4",
                            ]) as ViewStyle
                          }
                        >
                          {"Already\nunlocked"}
                        </Text>
                      </View>
                      <View
                        style={
                          style.flatten([
                            "flex-3",
                            "flex-row",
                            "justify-end",
                            "flex-wrap",
                          ]) as ViewStyle
                        }
                      >
                        <Text
                          style={
                            style.flatten([
                              "color-white",
                              "body3",
                              "text-right",
                            ]) as ViewStyle
                          }
                        >
                          {getVestedBalance()}
                        </Text>
                        <Text
                          style={
                            style.flatten([
                              "color-white@60%",
                              "body3",
                              "margin-left-4",
                            ]) as ViewStyle
                          }
                        >
                          {totalDenom}
                        </Text>
                      </View>
                    </View>
                  </React.Fragment>
                )}
              </SlideDownAnimation>
            </View>
          )}
        </BlurBackground>
      )}

      {/*Buttons*/}
      <View
        style={
          style.flatten([
            "flex-row",
            "justify-evenly",
            "margin-bottom-12",
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
