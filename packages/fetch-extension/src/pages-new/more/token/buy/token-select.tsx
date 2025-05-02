import React, { FunctionComponent, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";

interface ChainSelectProps {
  token: string;
  setToken: any;
  type: "sell" | "buy";
}

export const TokenSelect: FunctionComponent<ChainSelectProps> = observer(
  ({ type, token, setToken }) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const { chainStore } = useStore();

    const currentChain = chainStore.current.chainName;

    const tokenList = chainStore.chainInfos.find(
      (chainInfo) => chainInfo.chainName === currentChain
    )?.currencies;

    const handleChainSelect = async (token: string) => {
      setToken(token);
      setDropdownOpen(false);
    };

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
          onClick={() => setDropdownOpen(true)}
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
                  }}
                />
              )
          )}
        </Dropdown>
      </div>
    );
  }
);
