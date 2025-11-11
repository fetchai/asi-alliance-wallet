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
import { useNotification } from "@components/notification";

export const AddCosmosChain: FunctionComponent = () => {
  const navigate = useNavigate();
  const loadingIndicator = useLoadingIndicator();
  const notification = useNotification();
  const { chainStore, analyticsStore } = useStore();
  const [info, setInfo] = useState("");
  const [hasErrors, setHasErrors] = useState(false);
  const [autoFetchNetworkDetails, setAutoFetchNetworkDetails] = useState(true);
  const [newChainInfo, setNewChainInfo] = useState(INITIAL_CHAIN_CONFIG);
  const chainList = chainStore.chainInfos;
  const isChainIdExist = chainList.some(
    (chain) => chain.chainId === newChainInfo.chainId
  );

  const isChainNameExist = chainList.some(
    (chain) =>
      chain.chainName.toLowerCase() === newChainInfo.chainName.toLowerCase()
  );

  const isRPCExist = chainList.some((chain) => chain.rpc === newChainInfo.rpc);

  const isChainUnique = !isChainNameExist && !isRPCExist && !isChainIdExist;

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

        if (!rpcUrl || !restUrl || !denom || !chainId || !prefix) {
          setInfo(
            "Fetched partial chain information. Some details are missing, please verify and fill manually."
          );
        } else {
          setInfo("We've fetched information based on provided network name.");
        }
      } catch (err) {
        setNewChainInfo({
          ...INITIAL_CHAIN_CONFIG,
          chainName: newChainInfo.chainName,
        });
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

  const checkEndpointValidity = async (url: string, type: "rpc" | "rest") => {
    if (!isUrlValid(url)) return false;

    const path =
      type === "rpc" ? "/status" : "/cosmos/base/tendermint/v1beta1/node_info";

    try {
      const fullUrl = `${url.replace(/\/$/, "")}${path}`;
      const res = await axios.get(fullUrl, { timeout: 4000 });

      if (!res || res.status !== 200 || typeof res.data !== "object") {
        return false;
      }

      const network =
        type === "rpc"
          ? res.data?.result?.node_info?.network
          : res.data?.default_node_info?.network ||
            res?.data?.node_info?.network;
      return (
        typeof network === "string" &&
        network.trim().length > 0 &&
        network.trim() === newChainInfo.chainId
      );
    } catch {
      return false;
    }
  };

  useEffect(() => {
    // Cancel any pending call if chain becomes non-unique
    if (!isChainNameExist && !isChainIdExist) {
      debouncedFetchChainInfo.cancel();
    }

    return () => {
      debouncedFetchChainInfo.cancel();
    };
  }, [isChainNameExist, isChainIdExist, debouncedFetchChainInfo]);

  const cleanDecimalInput = (value: string) => {
    if (value.trim() === "") return "";
    value = value.replace(/\..*$/, "");
    value = value.replace(/^0+(?=\d)/, "");
    if (!/^\d+$/.test(value)) return "";
    const num = Math.min(Number(value), 18);
    return num.toString();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasErrors(false);
    setInfo("");
    const { name, value } = e.target;

    // Prevent spaces in all fields except chainName and decimal
    if (name !== "chainName" && name !== "decimal" && /\s/.test(value)) {
      return;
    }

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
        bech32Config: Bech32Address.defaultBech32Config(value.trim()),
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
            coinMinimalDenom: value.trim().toLowerCase(),
          },
        ],
        feeCurrencies: [
          {
            ...newChainInfo.feeCurrencies[0],
            coinDenom: value,
            coinMinimalDenom: value.trim().toLowerCase(),
          },
        ],
      });
    } else if (name === "decimal") {
      const cleanedValue = cleanDecimalInput(value);
      e.target.value = cleanedValue; // To reflect the change in the input field immediately
      const decimals = parseInt(cleanedValue);
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
      loadingIndicator.setIsLoading("chain-details-adding", true);
      // checking if the provided endpoint is a valid rest/rpc url
      const [isRpcValid, isRestValid] = await Promise.all([
        checkEndpointValidity(newChainInfo.rpc, "rpc"),
        checkEndpointValidity(newChainInfo.rest, "rest"),
      ]);

      if (!isRpcValid || !isRestValid) {
        const errorMessage = !isRpcValid
          ? "Please enter a valid RPC URL"
          : !isRestValid
          ? "Please enter a valid REST URL"
          : "Invalid REST or RPC URL. Please enter a valid URL";
        notification.push({
          type: "danger",
          placement: "top-center",
          duration: 5,
          content: errorMessage,
          canDelete: true,
          transition: {
            duration: 0.25,
          },
        });
        loadingIndicator.setIsLoading("chain-details-adding", false);
        setHasErrors(true);
        setInfo(errorMessage);
        return;
      }

      chainStore.addCustomChainInfo(newChainInfo);
      chainStore.selectChain(newChainInfo.chainId);
      loadingIndicator.setIsLoading("chain-details-adding", false);
      analyticsStore.logEvent("add_chain_click", {
        pageName: "Add new Cosmos chain",
      });
    } catch (error) {
      console.error(error);
      loadingIndicator.setIsLoading("chain-details-adding", false);
      setInfo("Error adding chain.");
      setHasErrors(true);
    }
  };

  const isChainNameValid =
    /^[a-z0-9-_ ()]{1,64}$/i.test(newChainInfo.chainName) &&
    (newChainInfo.chainName.match(/\(/g)?.length || 0) ===
      (newChainInfo.chainName.match(/\)/g)?.length || 0);
  const isChainIdValid = /^[a-z0-9-_]{3,64}$/.test(newChainInfo.chainId);
  const isValidBech32Prefix = /^[a-z][a-z0-9]{1,15}$/.test(
    newChainInfo.bech32Config.bech32PrefixAccAddr
  );
  const isValidDecimals =
    newChainInfo.stakeCurrency.coinDecimals >= 0 &&
    newChainInfo.stakeCurrency.coinDecimals <= 18;
  const denom = newChainInfo.stakeCurrency.coinDenom.trim();
  const isValidDenom = /^([A-Za-z]{2,10}|ibc\/[A-Fa-f0-9]{32,64})$/.test(denom);

  const hasValidInputs =
    isChainIdValid &&
    isChainNameValid &&
    isValidBech32Prefix &&
    isValidDenom &&
    isValidDecimals;

  const isValid =
    isUrlValid(newChainInfo.rpc) &&
    isUrlValid(newChainInfo.rest) &&
    !hasErrors &&
    isChainUnique &&
    hasValidInputs;

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
          text={
            !loadingIndicator.isLoading
              ? "The network name may automatically update based on registry data."
              : ""
          }
          error={
            isChainNameExist
              ? "Network with this name already exists."
              : !isChainNameValid && newChainInfo.chainName !== ""
              ? "Please enter valid network name. Use only letters, numbers and basic symbols."
              : ""
          }
          formGroupClassName={
            loadingIndicator.isLoading("chain-details") ||
            (!hasErrors && info) ||
            (!isChainNameValid && newChainInfo.chainName !== "")
              ? style["formGroupChainName"]
              : style["formGroup"]
          }
          formFeedbackClassName={style["formFeedback"]}
          formTextClassName={style["formFeedback"]}
          value={newChainInfo.chainName}
          onChange={handleChange}
          required
        />
        {loadingIndicator.isLoading("chain-details") && (
          <p className={style["infoMessage"]}>Fetching chain details...</p>
        )}
        {!hasErrors && info && (
          <p className={style["infoMessage"]} style={{ marginTop: "0px" }}>
            {info}
          </p>
        )}
        <Input
          label="Chain ID"
          type="text"
          name="chainId"
          value={newChainInfo.chainId}
          error={
            isChainIdExist
              ? "Network with this chainId already exists."
              : !isChainIdValid && newChainInfo.chainId !== ""
              ? "Please enter a valid chain ID using only lowercase letters, numbers, and hyphen."
              : ""
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
            newChainInfo.rest !== "" && !isUrlValid(newChainInfo.rest)
              ? "Invalid REST URL"
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
          error={
            !isValidBech32Prefix &&
            newChainInfo.bech32Config.bech32PrefixAccAddr
              ? "Please enter a valid address prefix"
              : ""
          }
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
          error={
            !isValidDenom && denom !== "" ? "Please enter a valid symbol" : ""
          }
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
          error={
            !isValidDecimals &&
            newChainInfo.stakeCurrency.coinDecimals !== undefined
              ? "Please enter a valid integer between 0 and 18"
              : ""
          }
          onChange={handleChange}
          required
        />
        <div
          className={`${style["select-item"]} ${
            autoFetchNetworkDetails ? style["selected"] : ""
          }`}
        >
          <span className={style["select-item-label"]}>
            Automatically fetch network details{" "}
            <em>(may not be available for all networks)</em>
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
        {hasErrors && info && <p className={style["infoMessage"]}>{info}</p>}
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
            loadingIndicator.isLoading("chain-details-adding") ||
            loadingIndicator.isLoading("chain-details")
              ? "Loading..."
              : "Add Chain"
          }
        />
      </Form>
    </HeaderLayout>
  );
};
