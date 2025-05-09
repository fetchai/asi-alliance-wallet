import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";
import { Input } from "@components-v2/form";
import { CoinPretty, Dec, Int } from "@keplr-wallet/unit";
import { validateDecimalPlaces } from "@utils/format";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useState } from "react";
import { useNavigate } from "react-router";
import { MoonpayApiKey, MoonpayOffRampApiURL } from "../../../../config.ui";
import { useStore } from "../../../../stores";
import { CurrencyList } from "./currency-list";
import { ErrorAlert } from "./error-alert";
import styles from "./style.module.scss";
import { TokenSelect } from "./token-select";

export const SellToken: FunctionComponent<{
  allowedCurrencyList?: any[];
  allowedTokenList?: any[];
  coinListLoading: boolean;
}> = observer(({ allowedCurrencyList, allowedTokenList, coinListLoading }) => {
  const navigate = useNavigate();
  const { chainStore, accountStore, queriesStore } = useStore();
  const chainId = chainStore.current.chainId;
  const chainName = chainStore.current.chainName;
  const defaultCurrency = allowedCurrencyList?.[0]?.code;
  const [token, setToken] = useState(
    chainStore?.current.currencies?.[0]?.coinDenom
  );
  const [amountError, setAmountError] = useState("");
  const [amount, setAmount] = useState("0");
  const [maxToggle, setMaxToggle] = useState(false);
  const [selectedCurrency, setSelectedCurrency] =
    useState<any>(defaultCurrency);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [tokenCode, setTokenCode] = useState("");

  const isEvm = chainStore.current.features?.includes("evm") ?? false;
  const defaultAddress =
    accountStore.getAccount(chainId)[
      isEvm ? "ethereumHexAddress" : "bech32Address"
    ];

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
  // get redirect URL sandbox onramp
  const redirectURL = (() => {
    const BASE_URL = MoonpayOffRampApiURL;
    const API_KEY = MoonpayApiKey || "pk_test_123";
    const fiatCurrency = selectedCurrency || defaultCurrency;
    const URL = `${BASE_URL}?apiKey=${API_KEY}&baseCurrencyAmount=${amount}&baseCurrencyCode=${tokenCode}&quoteCurrencyCode=${fiatCurrency}&refundWalletAddress=${defaultAddress}&showWalletAddressForm=true`;
    // const signature = generateSignature(URL, "sk_test_123");

    // return `${URL}&signature=${encodeURIComponent(signature)}`;
    return URL;
  })();

  const isAmountEmpty = amount === "" || amount === "0" || !tokenCode;

  const availableBalance = isEvm
    ? balanceETH.shrink(true).maxDecimals(6).hideDenom(true).toDec().toString()
    : balance.shrink(true).maxDecimals(6).hideDenom(true).toDec().toString();

  return (
    <div style={{ marginBottom: "60px" }}>
      <Input
        label="Chain"
        className={styles["input"]}
        value={chainName}
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
        type="sell"
        token={token}
        onTokenSelect={(tokenCode: string) => {
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
        label="Amount to sell"
        className={`${styles["input"]} ${styles["inputMax"]}`}
        value={amount}
        readOnly={!tokenCode}
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
              const toggleValue = !maxToggle;
              setMaxToggle(!maxToggle);
              setAmount(toggleValue ? availableBalance : "0");
            }}
          >
            Use Max
          </div>
        }
        error={amountError}
      />
      {!tokenCode && !coinListLoading ? (
        <ErrorAlert title="Sell feature is not supported for this token" />
      ) : (
        ""
      )}
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
