import { HeaderLayout } from "@layouts-v2/header-layout";
import { Input } from "@components-v2/form/input";
import React, {
  FunctionComponent,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useNavigate } from "react-router";
import { Form } from "reactstrap";
import { ButtonV2 } from "@components-v2/buttons/button";
import style from "./style.module.scss";
import { useStore } from "../../../stores";
import { Bech32Address } from "@keplr-wallet/cosmos";
import axios from "axios";
import { useLoadingIndicator } from "@components/loading-indicator";
import { debounce } from "lodash";
import { INITIAL_CHAIN_CONFIG } from "./constants";

export const AddCosmosChain: FunctionComponent = () => {
  const navigate = useNavigate();
  const loadingIndicator = useLoadingIndicator();
  const { chainStore, analyticsStore } = useStore();
  const [info, setInfo] = useState("");
  const [hasErrors, setHasErrors] = useState(false);
  const [autoFetchNetworkDetails, setAutoFetchNetworkDetails] = useState(true);
  const [newChainInfo, setNewChainInfo] = useState(INITIAL_CHAIN_CONFIG);
  const chainList = chainStore.chainInfosInUI;
  const isChainIdExist = chainList.some(
    (chain) => chain.chainId === newChainInfo.chainId
  );

  const isChainNameExist = chainList.some(
    (chain) =>
      chain.chainName.toLowerCase() === newChainInfo.chainName.toLowerCase()
  );

  const isRPCExist = chainList.some((chain) => chain.rpc === newChainInfo.rpc);

  const isRESTExist = chainList.some(
    (chain) => chain.rest === newChainInfo.rest
  );

  const isChainUnique =
    !isChainIdExist && !isChainNameExist && !isRPCExist && !isRESTExist;

  const isUrlValid = (url: string) => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
    } catch {
      return false;
    }
  };

  const fetchCosmosChainInfo = useCallback(
    async (chainName: string, autoFetch = true) => {
      if (!chainName || !autoFetch) return;

      loadingIndicator.setIsLoading("chain-details", true);

      try {
        // fetch from chain-registry
        const registryUrl = `https://raw.githubusercontent.com/cosmos/chain-registry/master/${chainName}/chain.json`;
        const { data: registryData } = await axios.get(registryUrl);

        if (!registryData) {
          setInfo(
            "Could not fetch the chain information, please fill manually."
          );
          return;
        }

        const chainId = registryData.chain_id;
        const chainDisplayName =
          registryData.pretty_name || registryData.chain_name || chainName;

        const rpcUrl = registryData.apis?.rpc?.[0]?.address ?? "";
        const restUrl = registryData.apis?.rest?.[0]?.address ?? "";
        const prefix = registryData.bech32_prefix || "cosmos";
        const logo = registryData.logo_URIs?.png;
        const denom = registryData.fees?.fee_tokens?.[0]?.denom;

        let coinData = {
          coinDenom: denom,
          coinMinimalDenom: denom,
          coinDecimals: 6,
        };

        if (restUrl && denom) {
          try {
            const denomUrl = `${restUrl.replace(
              /\/$/,
              ""
            )}/cosmos/bank/v1beta1/denoms_metadata/${denom}`;
            const { data: denomData } = await axios.get(denomUrl);

            const metadata = denomData?.metadata;
            if (metadata) {
              const displayUnit =
                metadata.denom_units?.find(
                  (unit: any) => unit.denom === metadata.display
                )?.exponent ?? 6;

              coinData = {
                coinDenom: metadata.display,
                coinMinimalDenom: denom,
                coinDecimals: displayUnit,
              };
            }
          } catch {
            console.warn("Failed to fetch denom metadata for", chainName);
          }
        }

        setNewChainInfo((prev) => ({
          ...prev,
          chainId,
          chainName: chainDisplayName,
          rpc: rpcUrl,
          rest: restUrl,
          bech32Config: Bech32Address.defaultBech32Config(prefix),
          stakeCurrency: coinData.coinDenom ? coinData : prev.stakeCurrency,
          currencies: coinData.coinDenom ? [coinData] : prev.currencies,
          feeCurrencies: [
            {
              ...(coinData.coinDenom ? coinData : prev.feeCurrencies[0]),
              gasPriceStep: prev.feeCurrencies[0].gasPriceStep,
            },
          ],
          chainSymbolImageUrl: logo,
        }));

        setInfo("We've fetched information based on provided network name.");
      } catch (err) {
        console.error("Failed to fetch chain info:", err);
        setInfo("Could not fetch chain details. Please fill manually.");
      } finally {
        loadingIndicator.setIsLoading("chain-details", false);
      }
    },
    [loadingIndicator]
  );

  // debounce the API calls to avoid excessive requests
  const debouncedFetchChainInfo = useMemo(
    () =>
      debounce((chainName: string, isUnique: boolean) => {
        const baseName = chainName
          .replace(/[-\s]/g, "") // remove all hyphens and spaces
          ?.toLowerCase();
        if (baseName && autoFetchNetworkDetails && isUnique)
          fetchCosmosChainInfo(baseName);
      }, 2000),
    [fetchCosmosChainInfo, autoFetchNetworkDetails]
  );

  useEffect(() => {
    // Cancel any pending call if chain becomes non-unique
    if (!isChainNameExist && !isChainIdExist) {
      debouncedFetchChainInfo.cancel();
    }

    return () => {
      debouncedFetchChainInfo.cancel();
    };
  }, [isChainNameExist, isChainIdExist, debouncedFetchChainInfo]);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasErrors(false);
    setInfo("");
    const { name, value } = e.target;

    if (name === "chainId") {
      setNewChainInfo({ ...newChainInfo, chainId: value });
    } else if (name === "chainName") {
      setNewChainInfo({ ...newChainInfo, chainName: value });
      debouncedFetchChainInfo(value, !isChainNameExist && !isChainIdExist);
    } else if (name === "rpc" || name === "rest") {
      setNewChainInfo({ ...newChainInfo, [name]: value });
    } else if (name === "prefix") {
      setNewChainInfo({
        ...newChainInfo,
        bech32Config: Bech32Address.defaultBech32Config(value),
      });
    } else if (name === "symbol") {
      setNewChainInfo({
        ...newChainInfo,
        stakeCurrency: {
          ...newChainInfo.stakeCurrency,
          coinDenom: value,
          coinMinimalDenom: value.toLowerCase(),
        },
        currencies: [
          {
            ...newChainInfo.currencies[0],
            coinDenom: value,
            coinMinimalDenom: value.toLowerCase(),
          },
        ],
        feeCurrencies: [
          {
            ...newChainInfo.feeCurrencies[0],
            coinDenom: value,
            coinMinimalDenom: value.toLowerCase(),
          },
        ],
      });
    } else if (name === "decimal") {
      const decimals = parseInt(value);
      setNewChainInfo({
        ...newChainInfo,
        stakeCurrency: {
          ...newChainInfo.stakeCurrency,
          coinDecimals: decimals,
        },
        currencies: [
          {
            ...newChainInfo.currencies[0],
            coinDecimals: decimals,
          },
        ],
        feeCurrencies: [
          {
            ...newChainInfo.feeCurrencies[0],
            coinDecimals: decimals,
          },
        ],
      });
    } else {
      setNewChainInfo({ ...newChainInfo, [name]: value });
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    try {
      chainStore.addCustomChainInfo(newChainInfo);
      chainStore.selectChain(newChainInfo.chainId);
      analyticsStore.logEvent("add_chain_click", {
        pageName: "Add new Cosmos chain",
      });
      setInfo("Cosmos chain added successfully");
    } catch (error) {
      console.error(error);
      setInfo("Error adding chain.");
      setHasErrors(true);
    }
  };

  const isValid =
    newChainInfo.rpc &&
    newChainInfo.rest &&
    newChainInfo.chainId &&
    newChainInfo.stakeCurrency.coinDenom &&
    newChainInfo.stakeCurrency.coinDecimals &&
    !hasErrors &&
    isChainUnique;

  return (
    <HeaderLayout
      showBottomMenu={false}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      smallTitle={true}
      alternativeTitle="Add Custom Cosmos Network"
      onBackButton={() => navigate(-1)}
    >
      <Form onSubmit={handleSubmit} className={style["container"]}>
        <Input
          label="Network Name"
          type="text"
          name="chainName"
          error={
            isChainNameExist ? "Network with this name already exists." : ""
          }
          formGroupClassName={
            loadingIndicator.isLoading
              ? style["formGroupChainName"]
              : style["formGroup"]
          }
          formFeedbackClassName={style["formFeedback"]}
          value={newChainInfo.chainName}
          onChange={handleChange}
          required
        />
        {loadingIndicator.isLoading && (
          <p className={style["infoMessage"]}>Fetching chain details...</p>
        )}
        <Input
          label="Chain ID"
          type="text"
          name="chainId"
          value={newChainInfo.chainId}
          error={
            isChainIdExist ? "Network with this chainId already exists." : ""
          }
          formGroupClassName={style["formGroup"]}
          formFeedbackClassName={style["formFeedback"]}
          onChange={handleChange}
          required
        />
        <Input
          label="RPC URL"
          type="text"
          name="rpc"
          value={newChainInfo.rpc}
          error={
            newChainInfo.rpc !== "" && !isUrlValid(newChainInfo.rpc)
              ? "Invalid RPC URL"
              : isRPCExist
              ? "Network with this RPC URL already exists."
              : ""
          }
          formGroupClassName={style["formGroup"]}
          formFeedbackClassName={style["formFeedback"]}
          onChange={handleChange}
          required
        />
        <Input
          label="REST URL"
          type="text"
          name="rest"
          value={newChainInfo.rest}
          error={
            newChainInfo.rest !== "" && !isUrlValid(newChainInfo.rpc)
              ? "Invalid REST URL"
              : isRESTExist
              ? "Network with this REST URL already exists."
              : ""
          }
          formGroupClassName={style["formGroup"]}
          formFeedbackClassName={style["formFeedback"]}
          onChange={handleChange}
          required
        />
        <Input
          label="Address Prefix"
          type="text"
          name="prefix"
          value={newChainInfo.bech32Config.bech32PrefixAccAddr}
          onChange={handleChange}
          formGroupClassName={style["formGroup"]}
          formFeedbackClassName={style["formFeedback"]}
          required
        />
        <Input
          label="Symbol"
          type="text"
          name="symbol"
          value={newChainInfo.stakeCurrency.coinDenom}
          onChange={handleChange}
          formGroupClassName={style["formGroup"]}
          formFeedbackClassName={style["formFeedback"]}
          required
        />
        <Input
          label="Decimals"
          type="number"
          name="decimal"
          formGroupClassName={style["formGroupDecimals"]}
          formFeedbackClassName={style["formFeedback"]}
          value={newChainInfo.stakeCurrency.coinDecimals}
          onChange={handleChange}
          required
        />
        <div
          className={`${style["select-item"]} ${
            autoFetchNetworkDetails ? style["selected"] : ""
          }`}
        >
          <span className={style["select-item-label"]}>
            Automatically fetch network details
          </span>
          <label className={style["select-checkbox-wrapper"]}>
            <input
              type="checkbox"
              onClick={() => {
                setAutoFetchNetworkDetails(!autoFetchNetworkDetails);
              }}
              checked={autoFetchNetworkDetails}
              readOnly
              tabIndex={-1}
            />
            <span className={style["select-checkbox"]} />
          </label>
        </div>
        {info && <p className={style["infoMessage"]}>{info}</p>}
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
          text={loadingIndicator.isLoading ? "Loading..." : "Add Chain"}
        />
      </Form>
    </HeaderLayout>
  );
};
