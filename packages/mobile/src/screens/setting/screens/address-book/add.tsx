import React, { FunctionComponent, useState } from "react";
import { PageWithScrollView } from "components/page";
import { useStyle } from "styles/index";
import { RouteProp, useRoute } from "@react-navigation/native";
import {
  AddressBookConfig,
  useMemoConfig,
  useRecipientConfig,
} from "@keplr-wallet/hooks";
import { View, ViewStyle } from "react-native";
import { useStore } from "stores/index";
import { AddressInput } from "components/input";
import { Button } from "components/button";
import { useSmartNavigation } from "navigation/smart-navigation";
import Toast from "react-native-toast-message";
import { InputCardView } from "components/new/card-view/input-card";
import { MemoInputView } from "components/new/card-view/memo-input";
import { observer } from "mobx-react-lite";

export const AddAddressBookScreen: FunctionComponent = observer(() => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          chainId: string;
          addressBookConfig: AddressBookConfig;
        }
      >,
      string
    >
  >();

  const { chainStore, analyticsStore } = useStore();

  const smartNavigation = useSmartNavigation();
  const addressBookConfig = route.params.addressBookConfig;

  const style = useStyle();

  const [name, setName] = useState("");
  const recipientConfig = useRecipientConfig(chainStore, route.params.chainId, {
    allowHexAddressOnEthermint: true,
  });
  const memoConfig = useMemoConfig(chainStore, route.params.chainId);

  return (
    <PageWithScrollView
      backgroundMode="image"
      contentContainerStyle={style.get("flex-grow-1")}
      style={style.flatten(["padding-x-page"]) as ViewStyle}
    >
      <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
      <InputCardView
        label="Nickname"
        containerStyle={style.flatten(["margin-y-4"]) as ViewStyle}
        onChangeText={(text: string) => {
          text = text.replace(/[~`!#$%^&*()+={}\[\]|\\:;"'<>,.?/₹•€£]/, "");
          if (text[0] === " " || text[0] === "-") {
            return;
          }
          if (
            (text[text.length - 1] === "-" && text[text.length - 2]) === "-"
          ) {
            return;
          }
          text = text.replace(/ {1,}/g, " ");
          setName(text);
        }}
        value={name}
        maxLength={30}
      />
      <AddressInput
        label="Address"
        recipientConfig={recipientConfig}
        memoConfig={memoConfig}
        disableAddressBook={true}
      />
      <MemoInputView
        label="Default memo (optional)"
        memoConfig={memoConfig}
        containerStyle={style.flatten(["margin-y-8"]) as ViewStyle}
        error={memoConfig.error?.message}
      />
      <View style={style.flatten(["flex-1"])} />
      <Button
        text="Save"
        size="large"
        containerStyle={style.flatten(["border-radius-32"]) as ViewStyle}
        textStyle={style.flatten(["body2", "font-normal"]) as ViewStyle}
        disabled={
          !name || recipientConfig.error != null || memoConfig.error != null
        }
        onPress={async () => {
          if (
            name &&
            recipientConfig.error == null &&
            memoConfig.error == null
          ) {
            /// return -1 if address not matched
            const addressIndex = addressBookConfig.addressBookDatas.findIndex(
              (element) => element.address === recipientConfig.recipient
            );

            /// Validating a new address is unique in the address book
            if (addressIndex < 0) {
              addressBookConfig.addAddressBook({
                name: name.trim(),
                address: recipientConfig.recipient,
                memo: memoConfig.memo,
              });
              analyticsStore.logEvent("save_new_address_click", {
                pageName: "Add an address",
              });
              smartNavigation.goBack();
            } else {
              Toast.show({
                type: "error",
                text1: "Address is already available in the Address Book",
              });
            }
          }
        }}
      />
      <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
    </PageWithScrollView>
  );
});
