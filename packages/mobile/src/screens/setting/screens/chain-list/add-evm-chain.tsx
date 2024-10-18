import React, { FunctionComponent, useState } from "react";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { ChainInfo } from "@keplr-wallet/types";
import { PageWithScrollView } from "components/page";
import { InputCardView } from "components/new/card-view/input-card";
import { useStore } from "stores/index";
import { Button } from "components/button/button";
import { Text, View, ViewStyle } from "react-native";
import Toast from "react-native-toast-message";
import { useNavigation } from "@react-navigation/native";
import axios from "axios";
import { useStyle } from "styles/index";
import { LoadingSpinner } from "components/spinner";

interface FieldLabel {
  label: string;
  editable: boolean;
}
const fieldLabels: Record<string, FieldLabel> = {
  rpc: {
    label: "RPC URL",
    editable: true,
  },
  chainId: { label: "Chain ID", editable: false },
  chainName: { label: "Chain Name", editable: false },
  symbol: { label: "Symbol", editable: false },
  decimal: { label: "Decimals", editable: false },
  explorerUrl: { label: "Explorer URL", editable: true },
};

export const AddEvmChain: FunctionComponent = () => {
  const style = useStyle();
  const { chainStore, analyticsStore } = useStore();
  const [hasErrors, setHasErrors] = useState(false);
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();

  const initialState: ChainInfo = {
    chainName: "",
    rpc: "",
    rest: "",
    chainId: "",
    stakeCurrency: {
      coinDenom: "",
      coinMinimalDenom: "",
      coinDecimals: 0,
    },
    bip44: {
      coinType: 60,
    },
    bech32Config: Bech32Address.defaultBech32Config("fetch"),
    currencies: [
      {
        coinDenom: "",
        coinMinimalDenom: "",
        coinDecimals: 0,
        // coinGeckoId: "",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "",
        coinMinimalDenom: "",
        coinDecimals: 0,

        gasPriceStep: {
          low: 10000000000,
          average: 10000000000,
          high: 10000000000,
        },
      },
    ],
    chainSymbolImageUrl: "",
    features: ["evm"],
    explorerUrl: "",
  };
  const [newChainInfo, setNewChainInfo] = useState(initialState);
  const getChainInfo = async (rpcUrl: string) => {
    setLoading(true);
    try {
      const response = await axios.post(
        rpcUrl,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        },
        { timeout: 5000 }
      );

      if (response.status !== 200 || !response.data.result) {
        setInfo(
          "The rpc seems to be invalid. Please recheck the RPC url provided"
        );
        setHasErrors(true);
        return;
      }
      const chainId = parseInt(response.data.result, 16);
      if (chainStore.hasChain(chainId.toString())) {
        setInfo(
          "Network already exists. You can go to network settings if you want to update the RPC"
        );
        setHasErrors(true);
        return;
      }

      setNewChainInfo({
        ...newChainInfo,
        chainId: chainId.toString(),
      });

      const chains = await axios.get("https://chainid.network/chains.json");
      if (chains.status !== 200) {
        setInfo(
          "We've fetched chain id based on the provided RPC. You will need to enter other details manaually"
        );
        return;
      }

      const chainData = chains.data.find(
        (element: any) => chainId === element.chainId
      );

      if (chainData) {
        const successMessage =
          "We've fetched information based on the provided RPC.";
        setInfo(successMessage);
        Toast.show({ type: "success", text1: successMessage });

        const symbol = chainData.nativeCurrency.symbol;
        setNewChainInfo({
          ...newChainInfo,
          currencies: [
            {
              coinDenom: symbol,
              coinMinimalDenom: symbol,
              coinDecimals: chainData.nativeCurrency
                ? chainData.nativeCurrency.decimals
                : 0,
            },
          ],
          stakeCurrency: {
            coinDenom: symbol,
            coinMinimalDenom: symbol,
            coinDecimals: chainData.nativeCurrency
              ? chainData.nativeCurrency.decimals
              : 0,
          },
          feeCurrencies: [
            {
              coinDenom: symbol,
              coinMinimalDenom: symbol,
              coinDecimals: chainData.nativeCurrency
                ? chainData.nativeCurrency.decimals
                : 0,
              gasPriceStep: {
                low: 10000000000,
                average: 10000000000,
                high: 10000000000,
              },
            },
          ],
          rpc: rpcUrl,
          rest: rpcUrl,
          chainId: chainId.toString(),
          chainName: chainData.name,
          chainSymbolImageUrl: chainData.chainSymbolImageUrl,
          bech32Config: Bech32Address.defaultBech32Config(symbol.toLowerCase()),
          explorerUrl:
            chainData.explorers && chainData.explorers.length > 0
              ? chainData.explorers[0].url
              : undefined,
        });
      } else {
        const warningMessage =
          "We've fetched the chain ID based on the provided RPC. You will need to enter other details manually.";
        setInfo(warningMessage);
      }
    } catch (error) {
      setNewChainInfo({ ...initialState, rpc: rpcUrl });
      const errorMessage =
        "We could not fetch chain details, please try again.";
      Toast.show({ type: "error", text1: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const isUrlValid = (url: string) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return false;
      }
      return true;
    } catch (err) {
      return false;
    }
  };
  const handleChange = async (name: string, value: string) => {
    const rpcUrl = value.trim();
    setInfo("");
    setHasErrors(false);
    analyticsStore.logEvent("add_evm_chain_click");

    if (name === "rpc") {
      setNewChainInfo({
        ...newChainInfo,
        rpc: rpcUrl,
        chainId: "",
      });

      if (isUrlValid(rpcUrl)) {
        await getChainInfo(rpcUrl);
      }
    } else if (name === "decimal") {
      setNewChainInfo({
        ...newChainInfo,
        currencies: [
          {
            ...newChainInfo.currencies[0],
            coinDecimals: parseInt(rpcUrl),
          },
        ],
        stakeCurrency: {
          ...newChainInfo.stakeCurrency,
          coinDenom: rpcUrl,
          coinMinimalDenom: rpcUrl,
        },
        feeCurrencies: [
          {
            ...newChainInfo.feeCurrencies[0],
            coinDenom: rpcUrl,
            coinMinimalDenom: rpcUrl,
          },
        ],
      });
    } else if (name === "symbol") {
      setNewChainInfo({
        ...newChainInfo,
        currencies: [
          {
            ...newChainInfo.currencies[0],
            coinDenom: rpcUrl,
            coinMinimalDenom: rpcUrl,
          },
        ],
        stakeCurrency: {
          ...newChainInfo.stakeCurrency,
          coinDenom: rpcUrl,
          coinMinimalDenom: rpcUrl,
        },
        feeCurrencies: [
          {
            ...newChainInfo.feeCurrencies[0],
            coinDenom: rpcUrl,
            coinMinimalDenom: rpcUrl,
          },
        ],
      });
    } else {
      setNewChainInfo({
        ...newChainInfo,
        [name]: rpcUrl,
      });
    }
  };

  const isValid = !hasErrors && newChainInfo.rpc && newChainInfo.chainId;
  const handleSubmit = async () => {
    try {
      await chainStore.addEVMChainInfo(newChainInfo);
      Toast.show({
        type: "success",
        text1: "Chain added successfully!",
      });
      chainStore.selectChain(newChainInfo.chainId);
      chainStore.saveLastViewChainId();
      navigation.goBack();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: error?.message,
      });
    }
  };
  return (
    <PageWithScrollView
      backgroundMode="image"
      contentContainerStyle={style.get("flex-grow-1") as ViewStyle}
      style={style.flatten(["padding-x-page", "margin-y-8"]) as ViewStyle}
    >
      {Object.entries(fieldLabels).map(([field, { label, editable }]) => (
        <React.Fragment key={field}>
          <InputCardView
            label={label}
            value={
              field === "decimal"
                ? newChainInfo.currencies[0]?.coinDecimals.toString()
                : field === "symbol"
                ? newChainInfo.currencies[0]?.coinDenom
                : newChainInfo[field]
            }
            onChangeText={(value) => handleChange(field, value)}
            editable={editable}
            containerStyle={style.flatten(["margin-y-4"]) as ViewStyle}
            rightIcon={
              field === "rpc" && loading ? (
                <LoadingSpinner color={"white"} size={18} />
              ) : undefined
            }
          />

          {field === "rpc" && info && (
            <Text
              style={
                style.flatten([
                  "text-caption1",
                  "margin-top-8",
                  hasErrors ? "color-red-250" : "color-gray-400",
                ]) as ViewStyle
              }
            >
              {info}
            </Text>
          )}
        </React.Fragment>
      ))}

      <View style={style.flatten(["flex-1"]) as ViewStyle} />
      <Button
        text="Add Chain"
        size="large"
        containerStyle={style.flatten(["border-radius-64"]) as ViewStyle}
        textStyle={style.flatten(["body2", "font-normal"]) as ViewStyle}
        rippleColor="black@50%"
        disabled={!isValid || loading}
        loading={loading}
        onPress={handleSubmit}
      />
      <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
    </PageWithScrollView>
  );
};
