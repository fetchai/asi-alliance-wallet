import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";
import { Input } from "@components-v2/form";
import { validateDecimalPlaces } from "@utils/format";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useEffect, useState } from "react";
import { useStore } from "../../../../stores";
import { CurrencyList } from "./currency-list";
import styles from "./style.module.scss";
import { TokenSelect } from "./token-select";
import { useNavigate } from "react-router";
import { MoonpayOnRampApiURL, MoonpayApiKey } from "../../../../config.ui";
import { ErrorAlert } from "./error-alert";
import { Dec } from "@keplr-wallet/unit";
import { signMoonPayUrl } from "./utils";

export const BuyToken: FunctionComponent<{
  allowedCurrencyList?: any[];
  allowedTokenList?: any[];
  coinListLoading: boolean;
}> = observer(({ allowedCurrencyList, allowedTokenList, coinListLoading }) => {
  const navigate = useNavigate();
  const { chainStore, accountStore } = useStore();
  const chainId = chainStore.current.chainId;
  const currentChain = chainStore.current.chainName;
  const isEvm = chainStore.current.features?.includes("evm") ?? false;
  const defaultCurrency = allowedCurrencyList?.[0]?.code;
  const defaultAddress =
    accountStore.getAccount(chainId)[
      isEvm ? "ethereumHexAddress" : "bech32Address"
    ];
  const [amount, setAmount] = useState("0");
  const [token, setToken] = useState("");
  const [tokenCode, setTokenCode] = useState("");
  const [amountError, setAmountError] = useState("");
  const [selectedCurrency, setSelectedCurrency] =
    useState<any>(defaultCurrency);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [moonpayBuyAmount, setMoonpayBuyAmount] = useState({
    min: null,
    max: null,
  });

  // get redirect URL sandbox onramp
  const redirectURL = async () => {
    const fiatCurrency = selectedCurrency || defaultCurrency;
    const BASE_URL = MoonpayOnRampApiURL;
    const API_KEY = MoonpayApiKey;
    const params = new URLSearchParams({
      apiKey: API_KEY,
      currencyCode: tokenCode,
      baseCurrencyCode: fiatCurrency,
      baseCurrencyAmount: String(amount),
      walletAddress: defaultAddress,
      showWalletAddressForm: "true",
    });

    const URL = `${BASE_URL}?${params?.toString()}`;
    const signedURL = await signMoonPayUrl(URL);
    return signedURL;
  };

  useEffect(() => {
    const currencyCode = selectedCurrency || defaultCurrency;
    const currency = allowedCurrencyList?.find(
      (item: any) => item.code === currencyCode
    );
    setMoonpayBuyAmount({
      min: currency?.minBuyAmount ? currency?.minBuyAmount : null,
      max: currency?.maxBuyAmount ? currency?.maxBuyAmount : null,
    });
  }, [allowedCurrencyList, selectedCurrency, defaultCurrency]);

  const onTokenSelect = (token: any) => {
    setToken(token?.coinDenom);
    setTokenCode(token?.moonpayData?.code);
  };

  const isAmountEmpty =
    amount === "" || amount === "0" || !tokenCode || parseFloat(amount) === 0;

  const currency =
    selectedCurrency || defaultCurrency
      ? `(in ${
          selectedCurrency?.toUpperCase() || defaultCurrency?.toUpperCase()
        })`
      : "";

  return (
    <div style={{ marginBottom: "60px" }}>
      <Input
        label="Network"
        className={styles["input"]}
        value={currentChain}
        readOnly
      />
      <Input
        label="Address"
        className={styles["input"]}
        value={defaultAddress}
        readOnly
      />
      <TokenSelect
        allowedTokenList={allowedTokenList}
        type="buy"
        token={token}
        onTokenSelect={onTokenSelect}
        setToken={setToken}
      />
      <Card
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "16px" }}
        onClick={() => {
          if (tokenCode) {
            setIsDropdownOpen(true);
          }
        }}
        heading="Fiat Currency"
        subheading={
          selectedCurrency?.toUpperCase() || defaultCurrency?.toUpperCase()
        }
        rightContent={require("@assets/svg/wireframe/chevron-down.svg")}
      />
      <Input
        formGroupClassName={styles["formGroup"]}
        label={`Amount ${currency}`}
        formFeedbackClassName={styles["formFeedback"]}
        className={`${styles["input"]} ${styles["inputSell"]}`}
        value={amount}
        readOnly={!tokenCode}
        placeholder={`Enter amount ${currency}`}
        onChange={(e: any) => {
          setAmountError("");
          const { min, max } = moonpayBuyAmount;
          e.preventDefault();
          let value = e.target.value;
          if (value !== "" && !validateDecimalPlaces(value)) {
            return;
          }

          if (value !== "0") {
            // Remove leading zeros
            value = value.replace(/^0+(?!\.)/, "");
          }

          const amountInput = value || "0";
          setAmount(value);
          if (min !== null && new Dec(amountInput).lt(new Dec(min))) {
            setAmountError(`Amount should be >= ${min}`);
          }
          if (max !== null && new Dec(amountInput).gt(new Dec(max))) {
            setAmountError(`Amount should be <= ${max}`);
          }
        }}
        error={amountError}
      />
      {!tokenCode && !coinListLoading ? (
        <ErrorAlert title="Buy feature is not supported for this token" />
      ) : (
        ""
      )}
      <div className={styles["btnWrapper"]}>
        <ButtonV2
          text="Buy Using Moonpay"
          styleProps={{
            position: "fixed",
            width: "98%",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "16px",
            textTransform: "capitalize",
            backgroundColor:
              isAmountEmpty || amountError !== "" ? "transparent" : "white",
            color: isAmountEmpty || amountError !== "" ? "white" : "black",
            border:
              isAmountEmpty || amountError !== ""
                ? "1px solid white"
                : "1px solid transparent",
          }}
          onClick={async () => {
            const URL = await redirectURL();
            window.open(URL, "_blank");
            navigate("/");
          }}
          disabled={isAmountEmpty || amountError !== ""}
        />
      </div>
      <Dropdown
        closeClicked={() => setIsDropdownOpen(false)}
        isOpen={isDropdownOpen}
        setIsOpen={setIsDropdownOpen}
        title="Select Fiat Currency"
      >
        <CurrencyList
          allowedCurrencies={allowedCurrencyList || []}
          currency={selectedCurrency || allowedCurrencyList?.[0]?.code}
          onCurrencySelect={(currency: any) => {
            setSelectedCurrency(currency);
            setIsDropdownOpen(false);
          }}
        />
      </Dropdown>
    </div>
  );
});
