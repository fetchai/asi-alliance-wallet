import React, { FunctionComponent, useEffect, useState } from "react";
import { PageWithScrollView } from "components/page";
import { useStore } from "stores/index";
import { useStyle } from "styles/index";
import { InputCardView } from "components/new/card-view/input-card";
import { Button } from "components/button";
import { KeyboardSpacerView } from "components/keyboard";
import { MultiKeyStoreInfoWithSelectedElem } from "@keplr-wallet/background";
import { Text, View, ViewStyle } from "react-native";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { validateWalletName } from "utils/format/format";

export const RenameWalletScreen: FunctionComponent = () => {
  const { keyRingStore, accountStore, chainStore } = useStore();
  const style = useStyle();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const chainId = chainStore.current.chainId;
  const chainName = chainStore.current.chainName;

  const [newName, setNewName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [accountNameValidationError, setAccountNameValidationError] =
    useState(false);
  const [selectedKeyStore, setSelectedKeyStore] =
    useState<MultiKeyStoreInfoWithSelectedElem>();

  const account = accountStore.getAccount(chainId);
  const waitingNameData = keyRingStore.waitingNameData?.data;
  const isReadOnly =
    waitingNameData !== undefined && !waitingNameData?.editable;

  useEffect(() => {
    const selected = keyRingStore.multiKeyStoreInfo.find(
      (keyStore) => keyStore.selected
    );
    if (selected) {
      setSelectedKeyStore(selected);
    }
  }, []);

  const submitNewName = async () => {
    if (accountNameValidationError || !newName) return;

    setIsLoading(true);
    try {
      const selectedIndex = keyRingStore.multiKeyStoreInfo.findIndex(
        (keyStore) => keyStore === selectedKeyStore
      );

      if (selectedIndex < 0) return;

      const existingNameByChain = selectedKeyStore?.meta?.["nameByChain"]
        ? JSON.parse(selectedKeyStore.meta["nameByChain"])
        : {};

      const updatedNameByChain = {
        ...existingNameByChain,
        [chainId]: newName.trim(),
      };

      keyRingStore.updateNameKeyRing(
        selectedIndex,
        selectedKeyStore?.meta?.["name"] || "",
        updatedNameByChain
      );

      setSelectedKeyStore(undefined);
      setNewName("");
      navigation.goBack();
    } catch (e) {
      console.log("Fail to rename: " + e.message);
      setAccountNameValidationError(true);
      setErrorMessage("Failed to update name. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const showInfoMessage =
    newName !== "" &&
    newName.trim() !== account.name &&
    !accountNameValidationError;

  return (
    <PageWithScrollView
      backgroundMode="secondary"
      contentContainerStyle={style.get("flex-grow-1")}
      style={style.flatten(["padding-x-page", "padding-y-page"]) as ViewStyle}
    >
      <InputCardView
        label="Current wallet name"
        value={account.name}
        editable={false}
        inputStyle={style.flatten(["color-gray-300"]) as ViewStyle}
      />
      <InputCardView
        label="New wallet name"
        onChangeText={(text: string) => {
          if (!isReadOnly) {
            setErrorMessage("");
            const trimmedValue = text
              .trimStart()
              .replace(/[^a-zA-Z0-9 @_\-\.\(\)]/g, "")
              .replace(/ {2,}/g, " ");
            setNewName(trimmedValue);

            const isEmpty = trimmedValue === "";
            const { isValid, isValidFormat, containsLetterOrNumber } =
              validateWalletName(trimmedValue, keyRingStore.multiKeyStoreInfo);

            if (!isValid || isEmpty) {
              setErrorMessage(
                !isValidFormat
                  ? "Only letters, numbers and basic symbols (_-.@#()) are allowed."
                  : isEmpty
                  ? "Account name cannot be empty"
                  : !containsLetterOrNumber
                  ? "Account name must contain at least one letter or number."
                  : "Account name already exists, please try a different name"
              );
              setAccountNameValidationError(true);
            } else {
              setAccountNameValidationError(false);
            }
          }
        }}
        onBlur={() => setNewName(newName.trim())}
        value={newName}
        maxLength={30}
        error={accountNameValidationError ? errorMessage : undefined}
        returnKeyType="done"
        onSubmitEditing={submitNewName}
      />
      {showInfoMessage && (
        <Text
          style={
            style.flatten([
              "text-caption2",
              "color-gray-300",
              "margin-top-4",
            ]) as ViewStyle
          }
        >
          * This will update the account name for the selected network (
          {chainName}) only. Other networks will keep their current account
          name.
        </Text>
      )}
      <View style={style.get("flex-1")} />
      <Button
        text="Save"
        size="large"
        containerStyle={
          style.flatten([
            "border-radius-32",
            "background-color-dark",
          ]) as ViewStyle
        }
        textStyle={style.flatten(["color-white"]) as ViewStyle}
        loading={isLoading}
        onPress={submitNewName}
        disabled={
          !newName ||
          accountNameValidationError ||
          newName.trim() === account.name
        }
      />
      <KeyboardSpacerView />
    </PageWithScrollView>
  );
};
