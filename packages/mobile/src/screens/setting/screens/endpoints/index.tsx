import React, { FunctionComponent, useEffect, useState } from "react";
import { InputCardView } from "components/new/card-view/input-card";
import { PageWithScrollView } from "components/page";
import { ViewStyle, View } from "react-native";
import { useStyle } from "styles/index";
import { Button } from "components/button";
import { Controller, useForm } from "react-hook-form";
import { useStore } from "stores/index";
import axios from "axios";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import {
  checkRestConnectivity,
  checkRPCConnectivity,
} from "@keplr-wallet/chain-validator";

interface FormData {
  rpc: string;
  lcd: string;
}

export const SettingEndpointsPage: FunctionComponent = () => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const style = useStyle();
  const { chainStore } = useStore();

  const [selectedChainId, _setSelectedChainId] = useState(
    chainStore.current.chainId
  );

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
    watch,
  } = useForm<FormData>({
    defaultValues: {
      rpc: "",
      lcd: "",
    },
  });

  useEffect(() => {
    const chainInfo = chainStore.getChain(selectedChainId);
    setValue("rpc", chainInfo.rpc);
    setValue("lcd", chainInfo.rest);
  }, [chainStore, selectedChainId, setValue]);

  const selectedChainInfo = chainStore.getChain(selectedChainId);
  const isEvm = selectedChainInfo.features?.includes("evm");
  const [isLoading, setIsLoading] = useState(false);

  const submit = handleSubmit(async (data) => {
    setIsLoading(true);
    try {
      try {
        if (isEvm) {
          const response = await axios.post(
            data.rpc,
            {
              jsonrpc: "2.0",
              id: 1,
              method: "eth_chainId",
              params: [],
            },
            { timeout: 5000 }
          );

          if (response.status !== 200 || !response.data.result) {
            throw new Error(
              "The rpc seems to be invalid. Please recheck the RPC url provided"
            );
          }

          const chainId = parseInt(response.data.result, 16);
          if (selectedChainId !== chainId.toString()) {
            throw new Error(
              "The rpc seems to be invalid. Please recheck the RPC url provided"
            );
          }
        } else {
          await checkRPCConnectivity(selectedChainId, data.rpc);
          await checkRestConnectivity(selectedChainId, data.lcd);
        }
      } catch (e) {
        console.log("Error: ", e);
      }

      chainStore.setChainEndpoints(selectedChainId, data.rpc, data.lcd);

      // To avoid confusion when the user returns to the main page, select the chain if the rpc/lcd endpoints have changed.
      chainStore.selectChain(selectedChainId);

      navigation.navigate("Home", {});
    } catch (e) {
      console.log("Error: ", e);
    } finally {
      setIsLoading(false);
    }
  });

  return (
    <PageWithScrollView
      backgroundMode="image"
      contentContainerStyle={style.get("flex-grow-1")}
      style={style.flatten(["padding-x-page", "overflow-scroll"]) as ViewStyle}
    >
      <Controller
        control={control}
        rules={{
          required: "RPC endpoint is required",
          validate: (value: string) => {
            try {
              const url = new URL(value);
              if (url.protocol !== "http:" && url.protocol !== "https:") {
                return `Unsupported protocol: ${url.protocol}`;
              }
            } catch {
              return "Invalid url";
            }
          },
        }}
        render={({ field: { onChange, onBlur, value, ref } }) => {
          return (
            <InputCardView
              label="RPC"
              containerStyle={style.flatten(["margin-top-18"]) as ViewStyle}
              error={errors.rpc?.message}
              onBlur={() => {
                onBlur();
                onChange(value.trim());
              }}
              onChangeText={(text: string) => {
                onChange(text);
              }}
              value={value}
              maxLength={30}
              ref={ref}
            />
          );
        }}
        name="rpc"
        defaultValue=""
      />
      <Controller
        control={control}
        rules={{
          required: "LCD endpoint is required",
          validate: (value: string) => {
            try {
              const url = new URL(value);
              if (url.protocol !== "http:" && url.protocol !== "https:") {
                return `Unsupported protocol: ${url.protocol}`;
              }
            } catch {
              return "Invalid url";
            }
          },
        }}
        render={({ field: { onChange, onBlur, value, ref } }) => {
          return (
            <InputCardView
              label="LCD"
              keyboardType={"default"}
              containerStyle={style.flatten(["margin-top-8"]) as ViewStyle}
              returnKeyType="next"
              onSubmitEditing={() => {
                submit();
              }}
              error={errors.lcd?.message}
              onBlur={onBlur}
              onChangeText={(text: string) => onChange(text.trim())}
              value={value}
              ref={ref}
            />
          );
        }}
        name="lcd"
        defaultValue=""
      />
      <View style={style.flatten(["flex-1"])} />
      <Button
        containerStyle={style.flatten(["border-radius-32"]) as ViewStyle}
        text="Confirm"
        size="large"
        loading={isLoading}
        disabled={
          chainStore.getChain(selectedChainId).rpc === watch("rpc") &&
          chainStore.getChain(selectedChainId).rest === watch("lcd")
        }
        onPress={() => {
          submit();
        }}
      />
      <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
    </PageWithScrollView>
  );
};
