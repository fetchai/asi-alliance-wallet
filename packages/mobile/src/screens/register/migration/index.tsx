import React, { FunctionComponent, useState } from "react";
import { observer } from "mobx-react-lite";
import { PageWithScrollView } from "components/page";
import { Text, View, ViewStyle } from "react-native";
import { Button } from "components/button";
import { useStyle } from "styles/index";
import { InputCardView } from "components/new/card-view/input-card";
import { Controller, useForm } from "react-hook-form";
import { RegisterConfig } from "@keplr-wallet/hooks";
import { RouteProp, useRoute } from "@react-navigation/native";
import { useSmartNavigation } from "navigation/smart-navigation";
import { parseEthPrivateKey } from "@fetchai/eth-migration";
import { isPrivateKey } from "utils/format/format";
import { useStore } from "stores/index";

interface FormData {
  ethAddress: string;
  ethPrivateKey: string;
}

export const MigrateETHScreen: FunctionComponent = observer(() => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          registerConfig: RegisterConfig;
        }
      >,
      string
    >
  >();

  const registerConfig: RegisterConfig = route.params.registerConfig;

  const style = useStyle();

  const smartNavigation = useSmartNavigation();
  const { analyticsStore } = useStore();
  const [error, setError] = useState<string>();

  const {
    control,
    getValues,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  const submit = handleSubmit(() => {
    smartNavigation.navigateSmart("Register.CreateAccount", {
      registerConfig: registerConfig,
      mnemonic: encodeURIComponent(
        JSON.stringify(getValues("ethPrivateKey").trim())
      ),
    });
  });

  const privateKeyValidate = (value: string) => {
    if (!isPrivateKey(value)) {
      return "Invalid private key";
    } else {
      value = value.replace("0x", "");
      if (value.length !== 64) {
        return "Invalid length";
      }
      const privateKeyData = Buffer.from(value, "hex");
      try {
        if (
          privateKeyData.toString("hex").toLowerCase() !== value.toLowerCase()
        ) {
          return "Invalid private key";
        }
      } catch {
        return "Invalid private key";
      }

      // parse the private key
      const parsedKey = parseEthPrivateKey(privateKeyData);
      if (parsedKey === undefined) {
        return "Invalid ETH private key";
      }

      // check that the parsed private key matches
      if (parsedKey.ethAddress !== getValues("ethAddress")) {
        return "This private key does not match the address provided";
      }
    }
  };

  return (
    <PageWithScrollView
      backgroundMode="image"
      contentContainerStyle={style.get("flex-grow-1")}
      style={style.flatten(["padding-x-page", "overflow-scroll"]) as ViewStyle}
    >
      <Text style={style.flatten(["color-white", "h2"]) as ViewStyle}>
        Migrate from ETH
      </Text>
      <Controller
        control={control}
        rules={{
          required: "Ethereum Address is required",
        }}
        render={({ field: { onChange, onBlur, value, ref } }) => {
          return (
            <InputCardView
              label="Ethereum Address"
              containerStyle={style.flatten(["margin-top-18"]) as ViewStyle}
              error={errors.ethAddress?.message}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              multiline={true}
              onSubmitEditing={() => {
                submit();
              }}
              ref={ref}
            />
          );
        }}
        name="ethAddress"
        defaultValue=""
      />
      <Controller
        control={control}
        rules={{
          required: "Private key is required",
          validate: (value: string) => {
            return privateKeyValidate(value);
          },
        }}
        render={({ field: { onChange, onBlur, value, ref } }) => {
          return (
            <InputCardView
              label="Private Key"
              containerStyle={style.flatten(["margin-top-18"]) as ViewStyle}
              error={error ? error : errors.ethPrivateKey?.message}
              onBlur={onBlur}
              onChangeText={(text: string) => {
                if (text.length === 0) {
                  setError("");
                } else {
                  const data = privateKeyValidate(text);
                  setError(data ? data : "");
                }
                onChange(text);
              }}
              value={value}
              onSubmitEditing={() => {
                submit();
              }}
              multiline={true}
              numberOfLines={2}
              ref={ref}
            />
          );
        }}
        name="ethPrivateKey"
        defaultValue=""
      />

      <View style={style.flatten(["flex-1"])} />
      <Button
        containerStyle={
          style.flatten([
            "background-color-white",
            "border-radius-32",
            "margin-y-24",
          ]) as ViewStyle
        }
        textStyle={{
          color: "#0B1742",
        }}
        text="Next"
        size="large"
        rippleColor="black@10%"
        onPress={() => {
          submit();
          analyticsStore.logEvent("register_next_click", {
            registerType: "seed",
            accountType: "mnemonic",
            pageName: "Register",
          });
        }}
      />
    </PageWithScrollView>
  );
});
