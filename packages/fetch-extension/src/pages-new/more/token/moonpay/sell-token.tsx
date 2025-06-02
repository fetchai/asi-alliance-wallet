import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";
import { Input } from "@components-v2/form";
import { CoinPretty, Dec, Int } from "@keplr-wallet/unit";
import { validateDecimalPlaces } from "@utils/format";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { MoonpayApiKey, MoonpayOffRampApiURL } from "../../../../config.ui";
import { useStore } from "../../../../stores";
import { CurrencyList } from "./currency-list";
import { ErrorAlert } from "./error-alert";
import styles from "./style.module.scss";
import { TokenSelect } from "./token-select";
import { signMoonPayUrl } from "./utils";

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
  const [token, setToken] = useState("");
  const [amountError, setAmountError] = useState("");
  const [amount, setAmount] = useState("0");
  const [maxToggle, setMaxToggle] = useState(false);
  const [selectedCurrency, setSelectedCurrency] =
    useState<any>(defaultCurrency);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [tokenCode, setTokenCode] = useState("");
  const [moonpaySellAmount, setMoonpaySellAmount] = useState({
    min: null,
    max: null,
  });

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

  // get redirect URL sandbox offramp
  const redirectURL = async () => {
    const BASE_URL = MoonpayOffRampApiURL;
    const API_KEY = MoonpayApiKey;
    const fiatCurrency = selectedCurrency || defaultCurrency;
    const params = new URLSearchParams({
      apiKey: API_KEY,
      quoteCurrencyCode: fiatCurrency,
      baseCurrencyCode: tokenCode,
      baseCurrencyAmount: String(amount),
      walletAddress: defaultAddress,
      showWalletAddressForm: "true",
    });
    const URL = `${BASE_URL}?${params?.toString()}`;
    const signedURL = await signMoonPayUrl(URL);
    return signedURL;
  };

  const isAmountEmpty =
    amount === "" || amount === "0" || !tokenCode || parseFloat(amount) === 0;

  const availableBalance = isEvm
    ? balanceETH.shrink(true).maxDecimals(6).hideDenom(true).toDec().toString()
    : balance.shrink(true).maxDecimals(6).hideDenom(true).toDec().toString();

  const onTokenSelect = (token: any) => {
    setMoonpaySellAmount({
      min: token?.minSellAmount ? token?.minSellAmount : null,
      max: token?.maxSellAmount ? token?.maxSellAmount : null,
    });
    setToken(token?.coinDenom);
    setTokenCode(token?.moonpayData?.code);
  };

  useEffect(() => {
    const { min, max } = moonpaySellAmount;
    const amountInput = amount || "0";
    if (min !== null && new Dec(amountInput).lt(new Dec(min))) {
      setAmountError(`Amount should be >= ${min}`);
    } else if (max !== null && new Dec(amountInput).gt(new Dec(max))) {
      setAmountError(`Amount should be <= ${max}`);
    } else if (new Dec(amountInput).gt(new Dec(availableBalance))) {
      setAmountError("Amount exceeds available balance");
    } else {
      setAmountError("");
    }
  }, [amount, moonpaySellAmount]);

  return (
    <div style={{ marginBottom: "60px" }}>
      <Input
        label="Network"
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
        label="Amount to sell"
        formFeedbackClassName={styles["formFeedback"]}
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

          setAmount(value);
        }}
        inputGroupClassName={styles["inputGroupClass"]}
        append={
          <div
            onClick={() => {
              const toggleValue = !maxToggle;
              let amount = toggleValue ? availableBalance : "0";
              if (
                moonpaySellAmount.max !== null &&
                new Dec(availableBalance).gt(new Dec(moonpaySellAmount.max))
              ) {
                amount = String(moonpaySellAmount.max);
              }
              setMaxToggle(!maxToggle);
              setAmount(amount);
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
