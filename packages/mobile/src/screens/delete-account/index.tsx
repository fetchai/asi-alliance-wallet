import React, { FunctionComponent, useState } from "react";
import { PageWithScrollView } from "components/page";
import { useStore } from "stores/index";
import { useStyle } from "styles/index";
import { InputCardView } from "components/new/card-view/input-card";
import { Button } from "components/button";
import { KeyboardSpacerView } from "components/keyboard";
import { View, ViewStyle } from "react-native";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { IconWithText } from "components/new/icon-with-text/icon-with-text";
import { SimpleCardView } from "components/new/card-view/simple-card";
import { canShowPrivateData } from "screens/setting/screens/view-private-data";
import { PasswordInputModal } from "modals/password-input/modal";
import { useSmartNavigation } from "navigation/smart-navigation";
import { ConfirmCardModel } from "components/new/confirm-modal";
import { DeleteWalletIcon } from "components/new/icon/delete-wallet";
import { observer } from "mobx-react-lite";

export const DeleteWalletScreen: FunctionComponent = observer(() => {
  const { keyRingStore, keychainStore, analyticsStore } = useStore();
  const style = useStyle();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const smartNavigation = useSmartNavigation();

  const [password, setPassword] = useState("");
  const [isInvalidPassword, setIsInvalidPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [showConfirmModal, setConfirmModal] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const selectedKeyInfo = keyRingStore.selectedKeyInfo;
  const selectedKeyType = selectedKeyInfo?.type ?? "";
  const showPrivateData = canShowPrivateData(selectedKeyType);

  const submitPassword = async () => {
    setIsLoading(true);
    try {
      if (selectedKeyInfo) {
        await keyRingStore.showKeyRing(selectedKeyInfo.id, password);
        setIsInvalidPassword(false);
        setConfirmModal(true);
      }
    } catch (e) {
      console.log(e);
      setIsInvalidPassword(true);
      setPassword("");
      setIsLoading(false);
    }
  };

  return (
    <PageWithScrollView
      backgroundMode="secondary"
      contentContainerStyle={style.get("flex-grow-1")}
      style={style.flatten(["padding-x-page", "overflow-scroll"]) as ViewStyle}
    >
      <View style={style.flatten(["margin-x-30"]) as ViewStyle}>
        <IconWithText
          icon={<DeleteWalletIcon />}
          title={"Delete wallet"}
          subtitle={
            "You will no longer have access to\nyour wallet on ASI Alliance Wallet"
          }
          titleStyle={
            style.flatten(["h3", "font-normal", "color-dark"]) as ViewStyle
          }
          subtitleStyle={
            style.flatten(["body3", "color-gray-300"]) as ViewStyle
          }
        />
      </View>
      <InputCardView
        label="Password"
        keyboardType={"default"}
        error={isInvalidPassword ? "Invalid password" : undefined}
        onChangeText={(text: string) => {
          setIsInvalidPassword(false);
          setPassword(text.trim());
        }}
        value={password}
        onFocus={() => {
          setIsFocused(true);
        }}
        onBlur={() => {
          setIsFocused(false);
        }}
        returnKeyType="done"
        secureTextEntry={true}
        onSubmitEditing={submitPassword}
        containerStyle={style.flatten(["margin-bottom-12"]) as ViewStyle}
      />
      <View style={style.get("flex-1")} />
      {showPrivateData && !isFocused ? (
        <React.Fragment>
          <SimpleCardView
            backgroundBlur={false}
            heading="Make sure you’ve backed up your mnemonic seed before proceeding."
            headingStyle={style.flatten(["body3", "color-dark"]) as ViewStyle}
            cardStyle={
              style.flatten([
                "background-color-coral-red@25%",
                "margin-y-6",
                "padding-12",
              ]) as ViewStyle
            }
          />
          <Button
            text="Back Up Mnemonic Seed"
            size="large"
            mode="outline"
            onPress={() => {
              setIsOpenModal(true);
              analyticsStore.logEvent("back_up_mnemonic_seed_click", {
                pageName: "Home",
              });
            }}
            textStyle={
              style.flatten(["color-dark", "body2", "font-normal"]) as ViewStyle
            }
            containerStyle={
              style.flatten([
                "border-radius-32",
                "margin-y-12",
                "border-color-gray-100",
              ]) as ViewStyle
            }
          />
        </React.Fragment>
      ) : null}
      <Button
        text="Confirm"
        size="large"
        loading={isLoading}
        onPress={() => {
          submitPassword();
          analyticsStore.logEvent("confirm_click", {
            pageName: "Home",
          });
        }}
        disabled={!password}
        containerStyle={
          style.flatten([
            "border-radius-32",
            "background-color-dark",
          ]) as ViewStyle
        }
        textStyle={
          style.flatten(["body2", "font-normal", "color-white"]) as ViewStyle
        }
      />
      <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
      <KeyboardSpacerView />
      <PasswordInputModal
        isOpen={isOpenModal}
        close={() => setIsOpenModal(false)}
        title={`Enter your password to view your ${
          selectedKeyType === "mnemonic" ? "mnemonic seed" : "private key"
        }`}
        onEnterPassword={async (password) => {
          if (selectedKeyInfo) {
            const privateData = await keyRingStore.showKeyRing(
              selectedKeyInfo.id,
              password
            );
            smartNavigation.navigateSmart("Setting.ViewPrivateData", {
              privateData,
              privateDataType: selectedKeyType,
            });
          }
        }}
      />
      <ConfirmCardModel
        isOpen={showConfirmModal}
        close={() => setConfirmModal(false)}
        title={"Delete wallet"}
        subtitle={"Are you sure you want to delete this wallet?"}
        select={async (confirm: boolean) => {
          if (confirm) {
            try {
              if (selectedKeyInfo) {
                await keyRingStore.deleteKeyRing(selectedKeyInfo.id, password);
                if (keyRingStore.keyInfos.length === 0) {
                  await keychainStore.reset();
                  navigation.reset({
                    index: 0,
                    routes: [
                      {
                        name: "Unlock",
                      },
                    ],
                  });
                }
                analyticsStore.logEvent("delete_account_click", {
                  action: "Remove",
                });
              }
              setPassword("");
              navigation.goBack();
            } catch (e) {
              console.log(e);
              analyticsStore.logEvent("delete_account_click", {
                action: "Cancel",
              });
            } finally {
              setIsLoading(false);
            }
          } else {
            setIsLoading(false);
          }
        }}
      />
    </PageWithScrollView>
  );
});
