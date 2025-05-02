import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";
import { Input } from "@components-v2/form";
import { CoinPretty, Int, Dec } from "@keplr-wallet/unit";
import { validateDecimalPlaces } from "@utils/format";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useState } from "react";
import { useStore } from "../../../../stores";
import { CurrencyList } from "./currency-list";
import styles from "./style.module.scss";
import { TokenSelect } from "./token-select";
import { useNavigate } from "react-router";
// import crypto from "crypto";

export const SellToken: FunctionComponent<{
  allowedCurrencyList?: any[];
  allowedTokenList?: any[];
}> = observer(({ allowedCurrencyList, allowedTokenList }) => {
  console.log({ allowedTokenList });
  const navigate = useNavigate();
  const { chainStore, accountStore, queriesStore } = useStore();
  const currentChain = chainStore.current.chainName;
  const chainId = chainStore.current.chainId;
  const [token, setToken] = useState(
    chainStore?.current.currencies?.[0]?.coinDenom
  );
  const [amountError, setAmountError] = useState("");
  const [amount, setAmount] = useState("0");
  const [maxToggle, setMaxToggle] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<any>(
    allowedCurrencyList?.[0]?.code
  );
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const ethAddress = accountStore.getAccount("1").ethereumHexAddress;
  const defaultAddress = ethAddress;

  const isEvm = chainStore.current.features?.includes("evm") ?? false;
  const accountInfo = accountStore.getAccount(chainId);
  const queries = queriesStore.get(chainId);

  const queryBalances = queries.queryBalances.getQueryBech32Address(
    accountInfo.bech32Address
  );

  const currency = chainStore.current.feeCurrencies?.[0];
  const coinMinimalDenom = currency?.coinMinimalDenom;

  const spendableBalances = queries.cosmos.querySpendableBalances
    .getQueryBech32Address(accountInfo.bech32Address)
    ?.balances?.find(
      (bal) => coinMinimalDenom === bal.currency.coinMinimalDenom
    );

  const balance = spendableBalances
    ? spendableBalances
    : new CoinPretty(currency, new Int(0));

  const balancesMap = new Map(
    queryBalances.balances.map((bal) => [
      bal.currency.coinMinimalDenom,
      bal.balance,
    ])
  );

  const balanceETH =
    balancesMap.get(coinMinimalDenom) || new CoinPretty(currency, new Int(0));

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
      moonpay: "https://sell-sandbox.moonpay.com/",
    };

    const BASE_URL = SANDBOX_URL["moonpay"];
    const fiatCurrency = selectedCurrency || allowedCurrencyList?.[0]?.code;
    const URL = `${BASE_URL}?apiKey=pk_test_123&baseCurrencyAmount=${amount}&baseCurrencyCode=eth&quoteCurrencyCode=${fiatCurrency}&refundWalletAddress=${defaultAddress}?externalCustomerId=${"123456"}`;
    // const signature = generateSignature(URL, "sk_test_123");

    // return `${URL}&signature=${encodeURIComponent(signature)}`;
    return URL;
  })();

  const isAmountEmpty = amount === "" || amount === "0";

  const availableBalance = isEvm
    ? balanceETH.shrink(true).maxDecimals(6).hideDenom(true).toDec().toString()
    : balance.shrink(true).maxDecimals(6).hideDenom(true).toDec().toString();

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
      <TokenSelect type="sell" token={token} setToken={setToken} />
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
        label="Amount to sell"
        className={`${styles["input"]} ${styles["inputMax"]}`}
        value={amount}
        onChange={(e: any) => {
          e.preventDefault();
          setAmountError("");
          let value = e.target.value;
          if (value !== "" && !validateDecimalPlaces(value)) {
            return;
          }

          if (value !== "0") {
            // Remove leading zeros
            value = value.replace(/^0+(?!\.)/, "");
          }

          if (new Dec(value).gt(new Dec(availableBalance))) {
            setAmountError("Amount exceeds available balance");
          }

          setAmount(value);
        }}
        inputGroupClassName={styles["inputGroupClass"]}
        append={
          <div
            onClick={() => {
              setMaxToggle(!maxToggle);
              setAmount(maxToggle ? availableBalance : amount);
            }}
          >
            Use Max
          </div>
        }
        error={amountError}
      />
      <div className={styles["btnWrapper"]}>
        <ButtonV2
          text="Sell Using Moonpay"
          styleProps={{
            position: "fixed",
            width: "98%",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "16px",
            textTransform: "capitalize",
            backgroundColor: isAmountEmpty ? "transparent" : "white",
            color: isAmountEmpty ? "white" : "black",
            border: isAmountEmpty ? "1px solid white" : "1px solid transparent",
          }}
          onClick={() => {
            window.open(redirectURL, "_blank");
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
