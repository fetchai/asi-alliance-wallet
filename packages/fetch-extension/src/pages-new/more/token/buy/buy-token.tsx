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
// import crypto from "crypto";
import { useNavigate } from "react-router";

export const BuyToken: FunctionComponent<{
  allowedCurrencyList?: any[];
  allowedTokenList?: any[];
}> = observer(({ allowedCurrencyList, allowedTokenList }) => {
  console.log({ allowedCurrencyList, allowedTokenList });
  const navigate = useNavigate();
  const { chainStore, accountStore } = useStore();
  const currentChain = chainStore.current.chainName;
  const ethAddress = accountStore.getAccount("1").ethereumHexAddress;
  const defaultAddress = ethAddress;
  const [amount, setAmount] = useState("0");
  const [token, setToken] = useState(
    chainStore?.current?.currencies?.[0]?.coinDenom
  );
  const [selectedCurrency, setSelectedCurrency] = useState<any>(
    allowedCurrencyList?.[0]?.code
  );
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // const generateSignature = (url: string, secretKey: string) => {
  //   const signature = crypto
  //     .createHmac("sha256", secretKey)
  //     .update(new URL(url).search) // Use the query string part of the URL
  //     .digest("base64"); // Convert the result to a base64 string
  //   return signature; // Return the signature
  // };

  // get redirect URL sandbox onramp
  const redirectURL = (() => {
    const SANDBOX_URL: Record<string, string> = {
      kado: "https://sandbox--kado.netlify.app/",
      moonpay: "https://buy-sandbox.moonpay.com/",
    };

    const fiatCurrency = selectedCurrency || allowedCurrencyList?.[0]?.code;
    const BASE_URL = SANDBOX_URL["moonpay"];

    const URL = `${BASE_URL}?apiKey=pk_test_123&currencyCode=eth&baseCurrencyCode=${fiatCurrency}&baseCurrencyAmount=${amount}&walletAddress=${defaultAddress}`;
    // const signature = generateSignature(URL, "sk_test_123");
    return URL;
    // return `${URL}&signature=${encodeURIComponent(signature)}`;
  })();

  const isAmountEmpty = amount === "" || amount === "0";
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
      <TokenSelect type="buy" token={token} setToken={setToken} />
      <Card
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "16px" }}
        onClick={() => setIsDropdownOpen(true)}
        heading="Fiat Currency"
        subheading={
          selectedCurrency?.toUpperCase() ||
          allowedCurrencyList?.[0]?.code?.toUpperCase()
        }
        rightContent={require("@assets/svg/wireframe/chevron-down.svg")}
      />
      <Input
        label={`Amount (in ${selectedCurrency})`}
        className={styles["input"]}
        value={amount}
        placeholder={`Enter amount (in ${selectedCurrency})`}
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
