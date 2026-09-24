import { HeaderLayout } from "@layouts-v2/header-layout";
import { Input } from "@components-v2/form/input";
import React, { FunctionComponent, useState } from "react";
import { useNavigate } from "react-router";
import { Form } from "reactstrap";
import { ButtonV2 } from "@components-v2/buttons/button";
import style from "./style.module.scss";
import { useStore } from "../../../stores";
import axios from "axios";
import { useLoadingIndicator } from "@components/loading-indicator";
import { ChainInfo } from "@keplr-wallet/types";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { dispatchGlobalEventExceptSelf } from "@utils/global-events";
import { useNotification } from "@components/notification";

export const AddEvmChain: FunctionComponent = () => {
  const navigate = useNavigate();
  const notification = useNotification();
  const { chainStore, analyticsStore } = useStore();
  const [hasErrors, setHasErrors] = useState(false);
  const [info, setInfo] = useState("");
  const loadingIndicator = useLoadingIndicator();

  // const [chainIdMsg, setChainIdMsg] = useState("");
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
    features: ["eth-address-gen", "eth-key-sign"],
  };
  const [newChainInfo, setNewChainInfo] = useState(initialState);

  const toEip155ChainId = (evmChainId: number) => `eip155:${evmChainId}`;

  const hasExistingEvmChain = (evmChainId: number) => {
    return chainStore.hasChain(toEip155ChainId(evmChainId));
  };

  const getChainInfo = async (rpcUrl: string) => {
    loadingIndicator.setIsLoading("chain-details", true);
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

      const evmChainId = parseInt(response.data.result, 16);
      const caip2ChainId = toEip155ChainId(evmChainId);

      if (hasExistingEvmChain(evmChainId)) {
        setInfo(
          "Network already exists. You can go to network settings if you want to update the RPC"
        );
        setHasErrors(true);
        return;
      }

      const baseChainInfo = {
        ...newChainInfo,
        chainId: caip2ChainId,
        rpc: rpcUrl,
        rest: rpcUrl,
        updateFromRepoDisabled: true,
        evm: {
          chainId: evmChainId,
          rpc: rpcUrl,
          websocket: "",
        },
      };

      setNewChainInfo(baseChainInfo);

      const chains = await axios.get("https://chainid.network/chains.json");
      if (chains.status !== 200) {
        setInfo(
          "We've fetched chain id based on the provided RPC. You will need to enter other details manaually"
        );
        return;
      }

      const chainData = chains.data.find(
        (element: any) => evmChainId === element.chainId
      );

      if (chainData) {
        setInfo("We've fetched information based on the provided RPC.");
        const symbol = chainData.nativeCurrency.symbol;
        const coinMinimalDenom = symbol.toLowerCase();
        setNewChainInfo({
          ...baseChainInfo,
          currencies: [
            {
              coinDenom: symbol,
              coinMinimalDenom,
              coinDecimals: chainData.nativeCurrency
                ? chainData.nativeCurrency.decimals
                : 18,
            },
          ],
          stakeCurrency: {
            coinDenom: symbol,
            coinMinimalDenom,
            coinDecimals: chainData.nativeCurrency
              ? chainData.nativeCurrency.decimals
              : 18,
          },
          feeCurrencies: [
            {
              coinDenom: symbol,
              coinMinimalDenom,
              coinDecimals: chainData.nativeCurrency
                ? chainData.nativeCurrency.decimals
                : 18,
              gasPriceStep: {
                low: 10000000000,
                average: 10000000000,
                high: 10000000000,
              },
            },
          ],
          chainName: chainData.name,
        } as ChainInfo);
      } else {
        setInfo(
          "We've fetched chain id based on the provided RPC. You will need to enter other details manaually"
        );
      }
    } catch (error) {
      setNewChainInfo({ ...initialState, rpc: rpcUrl });
      setInfo("We could not fetch chain details, please try again.");
    } finally {
      loadingIndicator.setIsLoading("chain-details", false);
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

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setInfo("");
    const { name, value } = e.target;
    setHasErrors(false);
    analyticsStore.logEvent("add_evm_chain_click");
    if (name === "rpc") {
      setNewChainInfo({ ...newChainInfo, rpc: value, chainId: "" });

      if (isUrlValid(value)) {
        await getChainInfo(value);
      }
    } else if (name === "decimal") {
      setNewChainInfo({
        ...newChainInfo,
        currencies: [
          {
            ...newChainInfo.currencies[0],
            coinDecimals: parseInt(value),
          },
        ],
        stakeCurrency: {
          ...newChainInfo.stakeCurrency,
          coinDenom: value,
          coinMinimalDenom: value,
        },
        feeCurrencies: [
          {
            ...newChainInfo.feeCurrencies[0],
            coinDenom: value,
            coinMinimalDenom: value,
          },
        ],
      });
    } else if (name === "symbol") {
      setNewChainInfo({
        ...newChainInfo,
        currencies: [
          {
            ...newChainInfo.currencies[0],
            coinDenom: value,
            coinMinimalDenom: value,
          },
        ],
        stakeCurrency: {
          ...newChainInfo.stakeCurrency,
          coinDenom: value,
          coinMinimalDenom: value,
        },
        feeCurrencies: [
          {
            ...newChainInfo.feeCurrencies[0],
            coinDenom: value,
            coinMinimalDenom: value,
          },
        ],
      });
    } else {
      setNewChainInfo({
        ...newChainInfo,
        [name]: value,
      });
    }
  };

  const buildChainInfoToAdd = (): ChainInfo & {
    updateFromRepoDisabled: boolean;
  } => {
    const evmChainId =
      newChainInfo.evm?.chainId ??
      parseInt(newChainInfo.chainId.replace(/^eip155:/, ""), 10);
    const rpc = newChainInfo.rpc.trim();
    const symbol = newChainInfo.currencies[0].coinDenom;
    const coinMinimalDenom =
      newChainInfo.currencies[0].coinMinimalDenom || symbol.toLowerCase();
    const coinDecimals = newChainInfo.currencies[0].coinDecimals || 18;

    return {
      ...newChainInfo,
      chainId: toEip155ChainId(evmChainId),
      rpc,
      rest: rpc,
      updateFromRepoDisabled: true,
      evm: {
        chainId: evmChainId,
        rpc,
        websocket: newChainInfo.evm?.websocket ?? "",
      },
      currencies: [
        {
          coinDenom: symbol,
          coinMinimalDenom,
          coinDecimals,
        },
      ],
      stakeCurrency: {
        coinDenom: symbol,
        coinMinimalDenom,
        coinDecimals,
      },
      feeCurrencies: [
        {
          ...newChainInfo.feeCurrencies[0],
          coinDenom: symbol,
          coinMinimalDenom,
          coinDecimals,
        },
      ],
    };
  };

  const isValid =
    !hasErrors &&
    newChainInfo.rpc &&
    newChainInfo.chainId &&
    newChainInfo.chainName &&
    newChainInfo.currencies[0].coinDenom &&
    newChainInfo.currencies[0].coinDecimals > 0;

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    const chainInfoToAdd = buildChainInfoToAdd();
    try {
      loadingIndicator.setIsLoading("chain-suggest-switch", true);
      await chainStore.addCustomChainInfo(chainInfoToAdd);
      dispatchGlobalEventExceptSelf("keplr_suggested_chain_added");
      await chainStore.selectChain(chainInfoToAdd.chainId);
      await chainStore.saveLastViewChainId();
      notification.push({
        type: "success",
        placement: "top-center",
        duration: 5,
        content: `Succesfully added chain ${chainInfoToAdd.chainName}`,
        canDelete: true,
        transition: { duration: 0.25 },
      });
      navigate("/", { replace: true });
      analyticsStore.logEvent("add_chain_click", {
        pageName: "Add new EVM chain",
      });
    } catch (error) {
      notification.push({
        type: "danger",
        placement: "top-center",
        duration: 5,
        content: error.message || "Unable to add custom chain",
        canDelete: true,
        transition: { duration: 0.25 },
      });
      loadingIndicator.setIsLoading("chain-suggest-switch", false);
      console.log("error", error);
    }
  };

  return (
    <HeaderLayout
      showBottomMenu={false}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      smallTitle={true}
      alternativeTitle={"Add new EVM chain"}
      onBackButton={() => {
        navigate(-1);
        analyticsStore.logEvent("back_click", {
          pageName: "Add new EVM chain",
        });
      }}
    >
      <Form onSubmit={handleSubmit} className={style["container"]}>
        <Input
          formGroupClassName={style["formGroup"]}
          className={style["inputField"]}
          label="RPC URL"
          type="text"
          name="rpc"
          value={newChainInfo.rpc}
          onChange={handleChange}
          required
        />
        {info && <p className={style["infoMessage"]}>{info}</p>}
        <Input
          formGroupClassName={style["formGroup"]}
          className={style["inputField"]}
          label="Chain id"
          type="text"
          name="chainId"
          value={newChainInfo.chainId}
          disabled
          required
        />
        <Input
          formGroupClassName={style["formGroup"]}
          className={style["inputField"]}
          label="Network Name"
          type="text"
          name="chainName"
          value={newChainInfo.chainName}
          onChange={handleChange}
          required
        />
        <Input
          formGroupClassName={style["formGroup"]}
          className={style["inputField"]}
          label="Symbol"
          type="text"
          name="symbol"
          value={newChainInfo.currencies[0].coinDenom}
          onChange={handleChange}
          required
        />
        <Input
          formGroupClassName={style["formGroup"]}
          className={style["inputField"]}
          label="Decimal"
          type="number"
          name="decimal"
          value={newChainInfo.currencies[0].coinDecimals}
          onChange={handleChange}
          required
        />
        {/* <Input
          formGroupClassName={style["formGroup"]}
          className={style["inputField"]}
          label="Explorer Url"
          type="text"
          name="explorerUrl"
          value={newChainInfo?.explorerUrl ?? ""}
          onChange={handleChange}
        /> */}
        <ButtonV2
          variant="dark"
          styleProps={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "48px",
            fontSize: "14px",
            fontWeight: 400,
          }}
          disabled={!isValid}
          text={
            loadingIndicator.isLoading("chain-suggest-switch") ||
            loadingIndicator.isLoading("chain-details")
              ? "Loading..."
              : "Add Chain"
          }
        />
      </Form>
    </HeaderLayout>
  );
};
