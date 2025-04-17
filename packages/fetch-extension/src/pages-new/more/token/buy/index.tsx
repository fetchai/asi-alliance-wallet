import { ButtonV2 } from "@components-v2/buttons/button";
import { Input } from "@components-v2/form";
import { HeaderLayout } from "@layouts-v2/header-layout";
import React, { useState } from "react";
import { useNavigate, useParams } from "react-router";
import styles from "./style.module.scss";
import { CurrencyList } from "./currency-list";
import { Dropdown } from "@components-v2/dropdown";
import { Card } from "@components-v2/card";
import { ChainSelect } from "./chain-select";
import { useStore } from "../../../../stores";

export const BuyTokenPage = () => {
  const { provider } = useParams();
  const { chainStore, accountStore } = useStore();
  const currentChain = chainStore.current.chainName;
  const ethAddress = accountStore.getAccount("1").ethereumHexAddress;
  const defaultAddress =
    provider === "kado"
      ? "0x66E00DE0a2bAb21Db29e882F110E31F58497dAB8"
      : ethAddress;
  const defaultCurrency = provider === "kado" ? "INR" : "USD";
  const [amount, setAmount] = useState("0");
  const [chain, setChain] = useState(currentChain);
  const [selectedCurrency, setSelectedCurrency] =
    useState<any>(defaultCurrency);
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // get redirect URL sandbox onramp
  const redirectURL = (() => {
    const SANDBOX_URL: Record<string, string> = {
      kado: "https://sandbox--kado.netlify.app/",
      moonpay: "https://buy-sandbox.moonpay.com/",
    };

    const BASE_URL = SANDBOX_URL[provider as string];

    if (provider === "kado") {
      const queryParams = `?onPayAmount=${amount}&onPayCurrency=${selectedCurrency}&onRevCurrency=USDC&cryptoList=ETH,AVAX,USDC&onToAddress=${defaultAddress}`;
      return `${BASE_URL}ramp${queryParams}&network=ETHEREUM&networkList=ETHEREUM,AVALANCHE&product=BUY&productList=BUY&mode=minimal`;
    } else {
      const URL = `${BASE_URL}?apiKey=pk_test_123&currencyCode=eth&baseCurrencyCode=${selectedCurrency.toLowerCase()}&baseCurrencyAmount=${amount}&walletAddress=${defaultAddress}`;
      return URL;
    }
  })();

  const isAmountEmpty = amount === "" || amount === "0";

  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle="Buy Token"
      onBackButton={() => navigate(-1)}
      showBottomMenu={false}
    >
      <div className={styles["container"]}>
        <Input
          label="Address"
          className={styles["input"]}
          value={defaultAddress}
          readOnly
        />
        <ChainSelect chain={chain} setChain={setChain} />
        <Card
          style={{ background: "rgba(255,255,255,0.1)", marginBottom: "16px" }}
          onClick={() => setIsDropdownOpen(true)}
          heading="Currency"
          subheading={selectedCurrency}
          rightContent={require("@assets/svg/wireframe/chevron-down.svg")}
        />
        <Input
          label="Amount"
          className={styles["input"]}
          value={amount}
          onChange={(e: any) => {
            const numericValue = e.target.value.replace(/\D/g, "");
            setAmount(numericValue);
          }}
        />
        <ButtonV2
          text={`Buy Using ${provider}`}
          styleProps={{
            backgroundColor: isAmountEmpty ? "transparent" : "white",
            color: isAmountEmpty ? "white" : "black",
            marginTop: "75px",
            border: isAmountEmpty ? "1px solid white" : "1px solid transparent",
            textTransform: "capitalize",
          }}
          onClick={() => window.open(redirectURL, "_blank")}
          disabled={isAmountEmpty}
        />
        <Dropdown
          closeClicked={() => setIsDropdownOpen(false)}
          isOpen={isDropdownOpen}
          setIsOpen={setIsDropdownOpen}
          title="Select Fiat Currency"
        >
          <CurrencyList
            currency={selectedCurrency.toLowerCase()}
            onCurrencySelect={(currency: any) => {
              setSelectedCurrency(currency.toUpperCase());
              setIsDropdownOpen(false);
            }}
          />
        </Dropdown>
      </div>
    </HeaderLayout>
  );
};
