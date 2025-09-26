import { Staking } from "@keplr-wallet/stores";
import React, { useMemo, useState } from "react";
import { useStore } from "../../../stores";
import { ValidatorCardV2 } from "@components-v2/validator-card";
import { Dec } from "@keplr-wallet/unit";
import style from "./style.module.scss";
import { observer } from "mobx-react-lite";
import { NoResults } from "@components-v2/no-results";

type Sort = "APR" | "Voting Power" | "Name";

type ValidatorData = Staking.Validator;
export const SelectValidatorList = observer(
  ({
    filteredValidators,
    selectedValidator,
    setShowValidatorListDropDown,
    setShowValidatorDropdown,
    setClickedValidator,
    sort,
    setIsSortModalOpen,
  }: {
    filteredValidators: ValidatorData[];
    selectedValidator: ValidatorData;
    setShowValidatorListDropDown: React.Dispatch<React.SetStateAction<boolean>>;
    setShowValidatorDropdown: React.Dispatch<React.SetStateAction<boolean>>;
    setClickedValidator: React.Dispatch<
      React.SetStateAction<Staking.Validator>
    >;
    sort: Sort;
    setIsSortModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  }) => {
    const { chainStore, analyticsStore } = useStore();

    const [search, setSearch] = useState("");

    const data = useMemo(() => {
      let data = filteredValidators;
      const searchTrim = search.trim();
      if (searchTrim) {
        data = data.filter((val) =>
          val.description.moniker
            ?.toLowerCase()
            .includes(searchTrim.toLowerCase())
        );
      }
      switch (sort) {
        case "APR":
          data.sort((val1, val2) => {
            return new Dec(val1.commission.commission_rates.rate).gt(
              new Dec(val2.commission.commission_rates.rate)
            )
              ? 1
              : -1;
          });
          break;
        case "Name":
          data.sort((val1, val2) => {
            if (!val1.description.moniker) {
              return -1;
            }
            if (!val2.description.moniker) {
              return 1;
            }
            return val1.description.moniker > val2.description.moniker ? 1 : -1;
          });
          break;
        case "Voting Power":
          data.sort((val1, val2) => {
            return new Dec(val1.tokens).gt(new Dec(val2.tokens)) ? -1 : 1;
          });
          break;
      }

      return data;
    }, [filteredValidators, search, sort]);

    return (
      <React.Fragment>
        <div className={style["searchContainer"]}>
          <div className={style["searchBox"]}>
            <input
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <img src={require("@assets/svg/wireframe/search.svg")} alt="" />
          </div>
        </div>

        <div
          style={{
            position: "relative",
          }}
        >
          <div
            className={style["sort-selector"]}
            onClick={() => setIsSortModalOpen((prev) => !prev)}
          >
            <div>
              Sort by
              <span className={style["sort-by"]}>{sort}</span>
            </div>
            <div>
              <img
                src={require("../../../public/assets/svg/wireframe/chevron-down.svg")}
              />
            </div>
          </div>
        </div>
        {data.length ? (
          data.map((validator: ValidatorData) => (
            <React.Fragment key={validator.operator_address}>
              <ValidatorCardV2
                validator={validator}
                chainID={chainStore.current.chainId}
                onClick={() => {
                  setClickedValidator(validator);
                  setShowValidatorListDropDown(false);
                  setShowValidatorDropdown(true);
                  analyticsStore.logEvent("stake_validator_click", {
                    pageName: "Validator Details",
                  });
                }}
                selected={selectedValidator === validator}
              />
            </React.Fragment>
          ))
        ) : (
          <NoResults message="No Validators found" />
        )}
      </React.Fragment>
    );
  }
);
