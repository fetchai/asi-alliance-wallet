import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";
import { moonpaySupportedTokensByChainId, moonpayTokenCode } from "./utils";

interface ChainSelectProps {
  token: string;
  allowedTokenList: any;
  onTokenSelect: (token: any) => void;
  setToken: any;
  type: "sell" | "buy";
}

interface ITokenList {
  coinDenom: string;
  coinMinimalDenom: string;
  coinDecimals: number;
  moonpayData: any;
}

export const TokenSelect: FunctionComponent<ChainSelectProps> = observer(
  ({ type, token, allowedTokenList, setToken, onTokenSelect }) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const { chainStore } = useStore();
    const [tokenList, setTokenList] = useState<ITokenList[]>([]);

    const chainId = chainStore.current.chainId;

    const handleChainSelect = async (token: string) => {
      setToken(token);
      setDropdownOpen(false);
    };

    useEffect(() => {
      const tokens =
        moonpaySupportedTokensByChainId(
          chainId,
          allowedTokenList,
          chainStore.chainInfos
        )?.map((item) => {
          const moonpayCurrencyCode = moonpayTokenCode(chainId, item.coinDenom);
          const moonpayData = allowedTokenList?.find(
            (item: any) => item.code === moonpayCurrencyCode
          );
          return { ...item, moonpayData };
        }) || [];
      onTokenSelect(tokens?.[0]);
      setTokenList(tokens);
    }, [chainId, allowedTokenList, type]);

    return (
      <div style={{ marginBottom: "20px" }}>
        <Card
          heading={`Select Token (to ${type})`}
          subheading={token || "Not Supported"}
          rightContent={require("@assets/svg/wireframe/chevron-down.svg")}
          style={{
            height: "80px",
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
          title="Select Token"
          closeClicked={() => setDropdownOpen(false)}
        >
          {tokenList?.map(
            (tokenInfo, index) =>
              tokenInfo.coinDenom && (
                <Card
                  style={{
                    background:
                      tokenInfo.coinDenom === token ? "#E0FEDD" : "#F6F6F6",
                  }}
                  heading={tokenInfo.coinDenom}
                  key={index}
                  onClick={() => {
                    handleChainSelect(tokenInfo.coinDenom);
                    onTokenSelect(tokenInfo);
                  }}
                />
              )
          )}
        </Dropdown>
      </div>
    );
  }
);
