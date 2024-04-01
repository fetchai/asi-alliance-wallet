import React, { FunctionComponent, useState } from "react";
import { PageWithScrollView } from "components/page";
import { observer } from "mobx-react-lite";
import { useStore } from "stores/index";
import { useStyle } from "styles/index";
import { InputCardView } from "components/new/card-view/input-card";
import { Button } from "components/button";
import { KeyboardSpacerView } from "components/keyboard";
import { Image, View, ViewStyle } from "react-native";
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

export const DeleteWalletScreen: FunctionComponent = observer(() => {
  const { keyRingStore, keychainStore } = useStore();
  const style = useStyle();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const smartNavigation = useSmartNavigation();

  const [password, setPassword] = useState("");
  const [isInvalidPassword, setIsInvalidPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isOpenModal, setIsOpenModal] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const showPrivateData = canShowPrivateData(keyRingStore.keyRingType);

  const submitPassword = async () => {
    setIsLoading(true);
    const index = keyRingStore.multiKeyStoreInfo.findIndex(
      (keyStore) => keyStore.selected
    );
    try {
      if (index >= 0) {
        await keyRingStore.deleteKeyRing(index, password);
        if (keyRingStore.multiKeyStoreInfo.length === 0) {
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
      }
      setIsInvalidPassword(false);
      setPassword("");
      navigation.goBack();
    } catch (e) {
      console.log(e);
      setIsInvalidPassword(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageWithScrollView
      backgroundMode="image"
      contentContainerStyle={style.get("flex-grow-1")}
      style={style.flatten(["padding-x-page", "padding-y-page"]) as ViewStyle}
    >
      <View
        style={style.flatten(["margin-x-30", "margin-top-20"]) as ViewStyle}
      >
        <IconWithText
          icon={
            <Image
              source={require("assets/image/icon/ic_delete.png")}
              fadeDuration={0}
            />
          }
          title={"Delete wallet"}
          subtitle={
            "You will no longer have access to your wallet on Fetch Wallet"
          }
          titleStyle={style.flatten(["h2", "font-medium"]) as ViewStyle}
          subtitleStyle={style.flatten(["subtitle3"]) as ViewStyle}
        />
      </View>
      <InputCardView
        label="Password"
        keyboardType={"default"}
        error={isInvalidPassword ? "Invalid password" : undefined}
        onChangeText={(text: string) => {
          setPassword(text);
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
        containerStyle={style.flatten(["margin-y-20"]) as ViewStyle}
      />
      <View style={style.get("flex-1")} />
      {showPrivateData && !isFocused ? (
        <React.Fragment>
          <SimpleCardView
            heading="Make sure you’ve backed up your mnemonic seed before proceeding."
            cardStyle={
              style.flatten([
                "background-color-coral-red@25%",
                "margin-y-6",
              ]) as ViewStyle
            }
          />
          <Button
            text="Back up mnemonic seed"
            size="large"
            mode="outline"
            onPress={() => setIsOpenModal(true)}
            textStyle={style.flatten(["color-white"])}
            containerStyle={
              style.flatten([
                "border-radius-32",
                "margin-y-12",
                "border-color-gray-400",
              ]) as ViewStyle
            }
          />
        </React.Fragment>
      ) : null}
      <Button
        text="Confirm"
        size="large"
        loading={isLoading}
        onPress={submitPassword}
        disabled={!password}
        containerStyle={style.flatten(["border-radius-32"]) as ViewStyle}
      />
      <KeyboardSpacerView />
      <PasswordInputModal
        isOpen={isOpenModal}
        close={() => setIsOpenModal(false)}
        title={"Enter your password to view your mnemonic seed"}
        onEnterPassword={async (password) => {
          const index = keyRingStore.multiKeyStoreInfo.findIndex(
            (keyStore) => keyStore.selected
          );

          if (index >= 0) {
            const privateData = await keyRingStore.showKeyRing(index, password);
            smartNavigation.navigateSmart("Setting.ViewPrivateData", {
              privateData,
              privateDataType: keyRingStore.keyRingType,
            });
          }
        }}
      />
    </PageWithScrollView>
  );
});
