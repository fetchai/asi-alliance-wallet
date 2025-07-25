import React, { FunctionComponent, useMemo, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { useStyle } from "styles/index";
import { BlurBackground } from "components/new/blur-background/blur-background";

import { observer } from "mobx-react-lite";
import { IconButton } from "components/new/button/icon";
import {
  EmptyAddressError,
  ICNSFailedToFetchError,
  ICNSIsFetchingError,
  IMemoConfig,
  InvalidBech32Error,
  IRecipientConfig,
  IRecipientConfigWithICNS,
  useAddressBookConfig,
} from "@keplr-wallet/hooks";
import { useSmartNavigation } from "navigation/smart-navigation";
import { AddressBookCardModel } from "../addressbook-card/addressbook-card";
import { useStore } from "stores/index";
import { AsyncKVStore } from "../../../common";
import { Divider } from "../../divider";
import { QRCodeIcon } from "../icon/qrcode-icon";
import { ATIcon } from "../icon/at-icon";
import { Camera, PermissionStatus } from "expo-camera";
import { CameraPermissionModal } from "../camera-permission-model/camera-permission";
import {
  handleOpenSettings,
  ModelStatus,
} from "screens/register/import-from-extension/intro";
import { CameraPermissionOffIcon } from "../icon/camerapermission-off";
import { CameraPermissionOnIcon } from "../icon/camerapermission-on";

function numOfCharacter(str: string, c: string): number {
  return str.split(c).length - 1;
}

export const AddressInputCard: FunctionComponent<{
  label?: string;
  backgroundContainerStyle?: ViewStyle;
  placeholderText?: string;
  recipientConfig: IRecipientConfig | IRecipientConfigWithICNS;
  memoConfig?: IMemoConfig;
  onFocus?: any;
  onBlur?: any;
  pageName: string;
  buttonDisable?: boolean;
  editable?: boolean;
}> = observer(
  ({
    label,
    backgroundContainerStyle,
    placeholderText,
    recipientConfig,
    memoConfig,
    onFocus,
    onBlur,
    pageName,
    buttonDisable = false,
    editable = true,
  }) => {
    const style = useStyle();
    const smartNavigation = useSmartNavigation();
    const [isOpenModal, setIsOpenModal] = useState(false);
    const { chainStore, analyticsStore, accountStore } = useStore();

    const [openCameraModel, setIsOpenCameraModel] = useState(false);
    const [modelStatus, setModelStatus] = useState(ModelStatus.First);
    const [isFocused, setIsFocused] = useState(false);

    const chainId = chainStore.current.chainId;
    const account = accountStore.getAccount(chainStore.current.chainId);

    const addressBookConfig = useAddressBookConfig(
      new AsyncKVStore("address_book"),
      chainStore,
      chainId,
      {
        setRecipient: (recipient: string) => {
          if (recipientConfig) {
            recipientConfig.setRawRecipient(recipient);
          }
        },
        setMemo: (memo: string) => {
          if (memoConfig) {
            memoConfig.setMemo(memo);
          }
        },
      }
    );

    const error = recipientConfig.error;
    const errorText: string | undefined = useMemo(() => {
      if (error) {
        switch (error.constructor) {
          case EmptyAddressError:
            // No need to show the error to user.
            return;
          case InvalidBech32Error:
            return "Invalid address";
          case ICNSFailedToFetchError:
            return "Failed to fetch the address from ICNS";
          case ICNSIsFetchingError:
            return;
          default:
            return "Unknown error";
        }
      } else if (account.bech32Address == recipientConfig.recipient) {
        return "Same account address is not allowed.";
      }
    }, [error]);

    return (
      <React.Fragment>
        {label ? (
          <Text
            style={
              style.flatten([
                "padding-y-4",
                "margin-y-8",
                "color-white@60%",
                "body3",
              ]) as ViewStyle
            }
          >
            {label}
          </Text>
        ) : null}
        <BlurBackground
          borderRadius={12}
          blurIntensity={16}
          containerStyle={
            [
              style.flatten(
                ["padding-x-18", "padding-y-12"],
                isFocused || errorText
                  ? [
                      // The order is important.
                      // The border color has different priority according to state.
                      // The more in front, the lower the priority.
                      "border-width-1",
                      isFocused ? "border-color-indigo" : undefined,
                      errorText ? "border-color-red-250" : undefined,
                    ]
                  : []
              ),
              backgroundContainerStyle,
            ] as ViewStyle
          }
        >
          <View style={style.flatten(["flex-row"])}>
            <View
              style={style.flatten(["flex-3", "justify-center"]) as ViewStyle}
            >
              <TextInput
                placeholderTextColor={style.flatten(["color-white@60%"]).color}
                style={
                  [
                    style.flatten(["body3", "color-white", "padding-0"]),
                    Platform.select({
                      ios: {},
                      android: {
                        // On android, the text input's height does not equals to the line height by strange.
                        // To fix this problem, set the height explicitly.
                        height: 19,
                      },
                    }),
                  ] as ViewStyle
                }
                keyboardType={
                  Platform.OS === "ios" ? "ascii-capable" : "visible-password"
                }
                returnKeyType="done"
                placeholder={placeholderText}
                value={recipientConfig.rawRecipient}
                multiline={true}
                editable={editable}
                onChangeText={(text) => {
                  if (
                    // If icns is possible and users enters ".", complete bech32 prefix automatically.
                    "isICNSEnabled" in recipientConfig &&
                    recipientConfig.isICNSEnabled &&
                    text.length > 0 &&
                    text[text.length - 1] === "." &&
                    numOfCharacter(text, ".") === 1 &&
                    numOfCharacter(recipientConfig.rawRecipient, ".") === 0
                  ) {
                    text = text + recipientConfig.icnsExpectedBech32Prefix;
                  }
                  recipientConfig.setRawRecipient(text);
                }}
                onFocus={(e) => {
                  setIsFocused(true);

                  if (onFocus) {
                    onFocus(e);
                  }
                }}
                onBlur={(e) => {
                  setIsFocused(false);

                  if (onBlur) {
                    onBlur(e);
                  }
                }}
              />
            </View>
            <View
              style={
                style.flatten([
                  "items-end",
                  "justify-center",
                  "margin-left-20",
                ]) as ViewStyle
              }
            >
              <View style={style.flatten(["flex-row", "items-center"])}>
                <Divider
                  containerStyle={style.flatten(["height-16"]) as ViewStyle}
                />
                <IconButton
                  icon={
                    <QRCodeIcon
                      size={16}
                      color={
                        buttonDisable
                          ? style.get("color-white@20%").color
                          : "white"
                      }
                    />
                  }
                  borderRadius={0}
                  backgroundBlur={false}
                  disable={buttonDisable}
                  onPress={async () => {
                    const permission = await Camera.getCameraPermissionsAsync();
                    if (permission?.status == PermissionStatus.UNDETERMINED) {
                      setIsOpenCameraModel(true);
                    } else {
                      if (!permission?.granted) {
                        setModelStatus(ModelStatus.Second);
                        setIsOpenCameraModel(true);
                      } else {
                        analyticsStore.logEvent("recipient_address_click", {
                          pageName,
                        });
                        smartNavigation.navigateSmart("Camera", {
                          showMyQRButton: false,
                          recipientConfig: recipientConfig,
                        });
                      }
                    }
                  }}
                  iconStyle={style.flatten(["margin-x-18"]) as ViewStyle}
                />
                <IconButton
                  icon={
                    <ATIcon
                      size={16}
                      color={
                        buttonDisable
                          ? style.get("color-white@20%").color
                          : "white"
                      }
                    />
                  }
                  borderRadius={0}
                  backgroundBlur={false}
                  disable={buttonDisable}
                  onPress={() => {
                    analyticsStore.logEvent("recipient_address_click", {
                      pageName,
                    });
                    setIsOpenModal(true);
                  }}
                />
              </View>
            </View>
          </View>
        </BlurBackground>
        {errorText ? (
          <View>
            <Text
              style={StyleSheet.flatten([
                style.flatten(["text-caption2", "color-red-250"]) as ViewStyle,
              ])}
            >
              {errorText}
            </Text>
          </View>
        ) : null}
        <AddressBookCardModel
          isOpen={isOpenModal}
          title="Choose recipient"
          close={() => setIsOpenModal(false)}
          addressBookConfig={addressBookConfig}
          addAddressBook={(add) => {
            if (add) {
              analyticsStore.logEvent("add_new_address_click", {
                pageName,
              });
              smartNavigation.navigateSmart("AddAddressBook", {
                chainId,
                addressBookConfig,
              });
            }
          }}
        />
        <CameraPermissionModal
          title={
            modelStatus == ModelStatus.First
              ? "Camera permission"
              : "Camera permission is disabled"
          }
          icon={
            modelStatus == ModelStatus.First ? (
              <CameraPermissionOffIcon />
            ) : (
              <CameraPermissionOnIcon />
            )
          }
          buttonText={
            modelStatus == ModelStatus.First
              ? "Allow Fetch to use camera"
              : "Enable camera permission in settings"
          }
          isOpen={openCameraModel}
          close={() => setIsOpenCameraModel(false)}
          onPress={async () => {
            const permissionStatus =
              await Camera.requestCameraPermissionsAsync();
            if (permissionStatus.status === PermissionStatus.DENIED) {
              if (permissionStatus.canAskAgain) {
                setIsOpenCameraModel(false);
              } else {
                await handleOpenSettings();
                setIsOpenCameraModel(false);
              }
            } else {
              setIsOpenCameraModel(false);
              if (permissionStatus.status === PermissionStatus.GRANTED) {
                smartNavigation.navigateSmart("Camera", {
                  showMyQRButton: false,
                });
              }
            }
          }}
        />
      </React.Fragment>
    );
  }
);
