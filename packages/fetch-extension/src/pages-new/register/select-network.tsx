import { MultiSelectDropdown } from "@components-v2/multi-select";
import { observer } from "mobx-react-lite";
import React, { useEffect } from "react";
import { Label } from "reactstrap";
import { useStore } from "../../stores";
import style from "./style.module.scss";

interface SelectNetworkProps {
  selectedNetworks: string[];
  disabled: boolean;
  onMultiSelectChange: (items: string[]) => void;
  onSelectAll: (selected: boolean) => void;
}

export const SelectNetwork: React.FC<SelectNetworkProps> = observer(
  ({ selectedNetworks, disabled, onMultiSelectChange, onSelectAll }) => {
    const { chainStore } = useStore();
    const mainChainList = chainStore.chainInfos.filter(
      (chainInfo) => !chainInfo.beta && !chainInfo.features?.includes("evm")
    );

    const evmChainList = chainStore.chainInfos.filter((chainInfo) =>
      chainInfo.features?.includes("evm")
    );

    const networkList = [...mainChainList, ...evmChainList].map((chain) => ({
      id: chain.chainId,
      label: chain.chainName === "fetch" ? "Fetchhub" : chain.chainName,
    }));

    useEffect(() => {
      onMultiSelectChange?.(networkList.map((item) => item.id));
    }, []);

    return (
      <React.Fragment>
        <div>
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
      </React.Fragment>
    );
  }
);
