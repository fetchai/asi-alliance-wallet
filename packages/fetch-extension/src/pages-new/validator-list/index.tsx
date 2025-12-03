import { Dropdown } from "@components-v2/dropdown";
import { SelectorModal } from "@components-v2/selector-modal/selector";
import { Staking } from "@keplr-wallet/stores";
import { Dec } from "@keplr-wallet/unit";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useStore } from "../../stores";
import style from "./style.module.scss";
import { ValidatorsList } from "./validators";

type Sort = "APR" | "Voting Power" | "Name";

export const ValidatorListPage: FunctionComponent = observer(() => {
  const navigate = useNavigate();

  const { chainStore, queriesStore, analyticsStore } = useStore();
  const queries = queriesStore.get(chainStore.current.chainId);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("Voting Power");
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);

  const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Bonded
  );

  const unbondingValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonding
  );
  const unbondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonded
  );

  const data = useMemo(() => {
    let data = [
      ...bondedValidators.validators,
      ...unbondedValidators.validators,
      ...unbondingValidators.validators,
    ];
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
  }, [
    bondedValidators.validators,
    unbondedValidators.validators,
    unbondingValidators.validators,
    search,
    sort,
  ]);

  const apr = queries.cosmos.queryInflation.inflation;

  const items = useMemo(() => {
    // If inflation is 0 or not fetched properly, there is no need to sort by APY.
    if (apr.toDec().gt(new Dec(0))) {
      return [
        {
          label: "APR",
          key: "APR",
          icon: require("@assets/svg/wireframe/percentage.svg"),
        },
        {
          label: "Voting Power",
          key: "Voting Power",
          icon: require("@assets/svg/wireframe/voting-power.svg"),
        },
        {
          label: "Name",
          key: "Name",
          icon: require("@assets/svg/wireframe/user.svg"),
        },
      ];
    } else {
      return [
        {
          label: "Voting Power",
          key: "Voting Power",
          icon: require("@assets/svg/wireframe/voting-power.svg"),
        },
        {
          label: "Name",
          key: "Name",
          icon: require("@assets/svg/wireframe/user.svg"),
        },
      ];
    }
  }, [apr]);

  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      onBackButton={() => navigate("/stake")}
      showBottomMenu={false}
      alternativeTitle={"Stake"}
    >
      <div className={style["validatorListContainer"]}>
        <div className={style["searchContainer"]}>
          <div className={style["searchBox"]}>
            <input
              placeholder="Search by validator name or address"
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
            onClick={() => {
              setIsSortModalOpen((prev) => !prev);
              analyticsStore.logEvent("stake_validator_click", {
                pageName: "Stake",
              });
            }}
          >
            <div>
              Sort by
              <span className={style["sort-by"]}>{sort}</span>
            </div>
            <div>
              <img src={require("@assets/svg/wireframe/chevron-down.svg")} />
            </div>
          </div>
        </div>
        <ValidatorsList
          filteredValidators={data}
          bondedValidators={bondedValidators}
          unbondedValidators={unbondedValidators}
          unbondingValidators={unbondingValidators}
        />
        <Dropdown
          closeClicked={() => {
            setIsSortModalOpen(false);
          }}
          title="Sort By"
          isOpen={isSortModalOpen}
          setIsOpen={setIsSortModalOpen}
          styleProp={{
            maxHeight: "600px",
          }}
        >
          <SelectorModal
            close={() => {
              setIsSortModalOpen(false);
            }}
            isOpen={isSortModalOpen}
            items={items}
            selectedKey={sort}
            setSelectedKey={(key) => setSort(key as Sort)}
            modalPersistent={false}
          />
        </Dropdown>
      </div>
    </HeaderLayout>
  );
});
