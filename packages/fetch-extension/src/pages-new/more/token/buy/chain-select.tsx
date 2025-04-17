import React, { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";

interface ChainSelectProps {
  chain: string;
  setChain: any;
}

export const ChainSelect = observer(({ chain, setChain }: ChainSelectProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { chainStore } = useStore();

  const currentChain = chain || chainStore.current.chainName;

  const mainChainList = chainStore.chainInfos.filter(
    (chainInfo) => !chainInfo.beta && !chainInfo.features?.includes("evm")
  );

  const evmChainList = chainStore.chainInfos.filter((chainInfo) =>
    chainInfo.features?.includes("evm")
  );

  const handleChainSelect = async (chain: string) => {
    setChain(chain);
    setDropdownOpen(false);
  };

  const chainList = [...mainChainList, ...evmChainList];

  return (
    <div style={{ marginBottom: "20px" }}>
      <Card
        heading={"Chain"}
        subheading={currentChain}
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
        title={"Select Chain"}
        closeClicked={() => setDropdownOpen(false)}
      >
        {chainList.map(
          (chainInfo) =>
            chainInfo.chainId && (
              <Card
                style={{
                  background:
                    chainInfo.chainName === chain
                      ? "var(--Indigo---Fetch, #5F38FB)"
                      : "rgba(255, 255, 255, 0.1)",
                }}
                heading={chainInfo.chainName}
                key={chainInfo.chainId}
                onClick={() => {
                  handleChainSelect(chainInfo.chainName);
                }}
              />
            )
        )}
      </Dropdown>
    </div>
  );
});
