import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";
import { Input } from "@components-v2/form";
import { validateDecimalPlaces } from "@utils/format";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useState } from "react";
import { useStore } from "../../../../stores";
import { CurrencyList } from "./currency-list";
import styles from "./style.module.scss";
import { TokenSelect } from "./token-select";
// import { generateSignature } from "./utils";
import { useNavigate } from "react-router";
import { MoonpayApiKey, MoonpayOnRampApiURL } from "../../../../config.ui";
import { ErrorAlert } from "./error-alert";

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
  const [token, setToken] = useState(
    chainStore?.current?.currencies?.[0]?.coinDenom
  );
  const [tokenCode, setTokenCode] = useState("");
  const [selectedCurrency, setSelectedCurrency] =
    useState<any>(defaultCurrency);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // get redirect URL sandbox onramp
  const redirectURL = (() => {
    const fiatCurrency = selectedCurrency || defaultCurrency;
    const BASE_URL = MoonpayOnRampApiURL;
    const API_KEY = MoonpayApiKey || "pk_test_123";

    const URL = `${BASE_URL}?apiKey=${API_KEY}&currencyCode=${tokenCode}&baseCurrencyCode=${fiatCurrency}&baseCurrencyAmount=${amount}&walletAddress=${defaultAddress}&showWalletAddressForm=true`;
    // const signature = generateSignature(URL, "sk_test_123");
    return URL;
    // return `${URL}&signature=${encodeURIComponent(signature)}`;
  })();

  const isAmountEmpty = amount === "" || amount === "0" || !tokenCode;
  return (
    <div style={{ marginBottom: "60px" }}>
      <Input
        label="Chain"
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
        onTokenSelect={(tokenCode: string) => {
          console.log("tokenCode", { tokenCode });
          setTokenCode(tokenCode);
        }}
        setToken={setToken}
        setTokenCode={setTokenCode}
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
        label={`Amount ${
          selectedCurrency || defaultCurrency
            ? `(in ${
                selectedCurrency?.toUpperCase() ||
                defaultCurrency?.toUpperCase()
              })`
            : ""
        })`}
        className={`${styles["input"]} ${styles["inputSell"]}`}
        value={amount}
        readOnly={!tokenCode}
        placeholder={`Enter amount ${
          selectedCurrency || defaultCurrency
            ? `(in ${
                selectedCurrency?.toUpperCase() ||
                defaultCurrency?.toUpperCase()
              })`
            : ""
        })`}
        onChange={(e: any) => {
          e.preventDefault();
          let value = e.target.value;
          if (value !== "" && !validateDecimalPlaces(value)) {
            return;
          }

          if (value !== "0") {
            // Remove leading zeros
            value = value.replace(/^0+(?!\.)/, "");
          }

          setAmount(value);
        }}
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
            backgroundColor: isAmountEmpty ? "transparent" : "white",
            color: isAmountEmpty ? "white" : "black",
            position: "fixed",
            width: "98%",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "16px",
            border: isAmountEmpty ? "1px solid white" : "1px solid transparent",
            textTransform: "capitalize",
          }}
          onClick={() => {
            window.open(redirectURL, "_blank");
            navigate("/");
          }}
          disabled={isAmountEmpty}
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
