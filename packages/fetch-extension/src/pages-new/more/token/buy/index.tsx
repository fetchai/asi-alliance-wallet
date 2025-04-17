import { ButtonV2 } from "@components-v2/buttons/button";
import { Input } from "@components-v2/form";
import { HeaderLayout } from "@layouts-v2/header-layout";
import React, { useState } from "react";
import { useNavigate } from "react-router";
import styles from "./style.module.scss";
import { CurrencyList } from "./currency-list";
import { Dropdown } from "@components-v2/dropdown";
import { Card } from "@components-v2/card";
import { ChainSelect } from "./chain-select";
import { useStore } from "../../../../stores";

export const BuyTokenPage = () => {
  const { chainStore } = useStore();
  const currentChain = chainStore.current.chainName;
  const defaultAddress = "0x66E00DE0a2bAb21Db29e882F110E31F58497dAB8";
  const [amount, setAmount] = useState("0");
  const [chain, setChain] = useState(currentChain);
  const [selectedCurrency, setSelectedCurrency] = useState<any>("INR");
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const queryParams = `?onPayAmount=${amount}&onPayCurrency=${selectedCurrency}&onRevCurrency=USDC&cryptoList=ETH,AVAX,USDC&onToAddress=${defaultAddress}&network=ETHEREUM&networkList=ETHEREUM,AVALANCHE`;

  const isAmountEmpty = amount === "" || amount === "0";

  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={"Buy Token"}
      onBackButton={() => navigate(-1)}
      showBottomMenu={false}
    >
      <div className={styles["container"]}>
        <Input
          label="Address"
          className={styles["addressInput"]}
          value={defaultAddress}
          readOnly
        />
        <ChainSelect chain={chain} setChain={setChain} />
        <Card
          style={{ background: "rgba(255,255,255,0.1)", marginBottom: "16px" }}
          onClick={() => setIsDropdownOpen(true)}
          heading={"Currency"}
          subheading={selectedCurrency}
          rightContent={require("@assets/svg/wireframe/chevron-down.svg")}
        />
        <Input
          label="Amount"
          value={amount}
          onChange={(e: any) => {
            const numericValue = e.target.value.replace(/\D/g, "");
            setAmount(numericValue);
          }}
        />

        <a
          href={`https://sandbox--kado.netlify.app/ramp${queryParams}&product=BUY&productList=BUY&mode=minimal`}
          target="_blank"
          rel="noreferrer"
        >
          <ButtonV2
            text="Buy"
            styleProps={{
              backgroundColor: isAmountEmpty ? "transparent" : "white",
              color: isAmountEmpty ? "white" : "black",
              marginTop: "90px",
              border: isAmountEmpty
                ? "1px solid white"
                : "1px solid transparent",
            }}
            disabled={isAmountEmpty}
          />
        </a>
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
