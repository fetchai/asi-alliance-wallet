import { MultiSelectDropdown } from "@components-v2/multi-select";
import { observer } from "mobx-react-lite";
import React, { useEffect } from "react";
import { Label } from "reactstrap";
import { useStore } from "../../stores";
import style from "./style.module.scss";
import classNames from "classnames";

interface SelectNetworkProps {
  className?: string;
  selectedNetworks: string[];
  disabled: boolean;
  onMultiSelectChange: (items: string[]) => void;
  onSelectAll?: (selected: boolean) => void;
}

export const SelectNetwork: React.FC<SelectNetworkProps> = observer(
  ({
    className,
    selectedNetworks,
    disabled,
    onMultiSelectChange,
    onSelectAll,
  }) => {
    const { chainStore } = useStore();
    const mainChainList = chainStore.chainInfosInUI.filter(
      (chainInfo) => !chainInfo.beta && !chainInfo.features?.includes("evm")
    );

    const evmChainList = chainStore.chainInfosInUI.filter((chainInfo) =>
      chainInfo.features?.includes("evm")
    );

    const cosmosMainList = mainChainList.filter(
      (chainInfo) => chainInfo.raw.type !== "testnet"
    );

    const evmMainList = evmChainList.filter(
      (chainInfo) => chainInfo.raw.type !== "testnet"
    );

    const cosmosList = chainStore.showTestnet ? mainChainList : cosmosMainList;
    const evmList = chainStore.showTestnet ? evmChainList : evmMainList;

    const networkList = [...cosmosList, ...evmList].map((chain) => ({
      id: chain.chainId,
      label: chain.chainName === "fetch" ? "FetchHub" : chain.chainName,
    }));

    useEffect(() => {
      const items = networkList.map((item) => item.id);
      onMultiSelectChange?.(items);
    }, []);

    return (
      <div className={classNames(style["networkDropdownContainer"], className)}>
        <Label for="network" className={style["label"]}>
          Select Networks (for which you want to set account name)
        </Label>
        <MultiSelectDropdown
          items={networkList}
          value={selectedNetworks}
          disabled={disabled}
          className={style["networkDropdown"]}
          showSelectAll={true}
          selectAllLabel="Select All Networks"
          onChange={onMultiSelectChange}
          onSelectAll={onSelectAll}
        />
      </div>
    );
  }
);
