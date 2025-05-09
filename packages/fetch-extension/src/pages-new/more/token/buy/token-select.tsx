import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";
import { getCurrencyCodeForMoonpay } from "./utils";

interface ChainSelectProps {
  token: string;
  allowedTokenList: any;
  setTokenCode: any;
  onTokenSelect: (tokenCode: any) => void;
  setToken: any;
  type: "sell" | "buy";
}

interface ITokenList {
  coinDenom: string;
  coinMinimalDenom: string;
  coinDecimals: number;
  moonpayCode: string | undefined;
}

export const TokenSelect: FunctionComponent<ChainSelectProps> = observer(
  ({
    type,
    token,
    allowedTokenList,
    setToken,
    setTokenCode,
    onTokenSelect,
  }) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const { chainStore } = useStore();
    const [tokenList, setTokenList] = useState<ITokenList[]>([]);

    // const currentChain = chainStore.current.chainName;
    const chainId = chainStore.current.chainId;

    const handleChainSelect = async (token: string) => {
      setToken(token);
      setDropdownOpen(false);
    };

    const moonpayTokenCode = (chainId: string, coinDenom: string) => {
      return chainId === "1" && coinDenom === "FET"
        ? "fet_eth"
        : getCurrencyCodeForMoonpay(coinDenom);
    };

    useEffect(() => {
      const allowedTokensCode = allowedTokenList?.map((item: any) => item.code);
      const tokens =
        chainStore.chainInfos
          .find((chainInfo) => chainInfo.chainId === chainId)
          ?.currencies?.filter((item) => {
            const moonpayCurrencyCode = moonpayTokenCode(
              chainId,
              item.coinDenom
            );
            return allowedTokensCode?.includes(moonpayCurrencyCode);
          })
          ?.map((item) => {
            const moonpayCurrencyCode = moonpayTokenCode(
              chainId,
              item.coinDenom
            );
            return { ...item, moonpayCode: moonpayCurrencyCode };
          }) || [];
      setTokenCode(tokens?.[0]?.moonpayCode);
      setTokenList(tokens);
    }, [chainId, allowedTokenList, type]);

    return (
      <div style={{ marginBottom: "20px" }}>
        <Card
          heading={`Select Token (to ${type})`}
          subheading={token}
          rightContent={require("@assets/svg/wireframe/chevron-down.svg")}
          style={{
            height: "80px",
            background: "rgba(255,255,255,0.1)",
          }}
          onClick={() => {
            if (tokenList.length > 0) {
              setDropdownOpen(true);
            }
          }}
        />

        <Dropdown
          isOpen={dropdownOpen}
          setIsOpen={setDropdownOpen}
          title={"Select Token"}
          closeClicked={() => setDropdownOpen(false)}
        >
          {tokenList?.map(
            (tokenInfo, index) =>
              tokenInfo.coinDenom && (
                <Card
                  style={{
                    background:
                      tokenInfo.coinDenom === token
                        ? "var(--Indigo---Fetch, #5F38FB)"
                        : "rgba(255, 255, 255, 0.1)",
                  }}
                  heading={tokenInfo.coinDenom}
                  key={index}
                  onClick={() => {
                    handleChainSelect(tokenInfo.coinDenom);
                    onTokenSelect(tokenInfo?.moonpayCode);
                  }}
                />
              )
          )}
        </Dropdown>
      </div>
    );
  }
);
