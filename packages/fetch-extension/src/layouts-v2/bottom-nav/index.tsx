import activityIcon from "@assets/svg/wireframe/clock.svg";
import activitygreyIcon from "@assets/svg/wireframe/new-clock.svg";

import selectedHomeTabIcon from "@assets/svg/wireframe/new-home.svg";
import moreTabIcon from "@assets/svg/wireframe/new-more.svg";
import selectedMoreTabIcon from "@assets/svg/wireframe/selected-more.svg";
import selectedStakeTabIcon from "@assets/svg/wireframe/selected-stake.svg";
import stakeTabIcon from "@assets/svg/wireframe/stake-bottom-icon-new.svg";
import homeTabIcon from "@assets/svg/wireframe/wallet-new.svg";
import { separateNumericAndDenom } from "@utils/format";
import React, { useEffect, useState } from "react";

import { isFeatureAvailable } from "@utils/index";
import { WalletActions } from "../../pages-new/main/wallet-actions";
import { useStore } from "../../stores";
import style from "./style.module.scss";
import { Tab } from "./tab";

const bottomNav = [
  {
    title: "Home",
    icon: homeTabIcon,
    activeIcon: selectedHomeTabIcon,
    path: "/",
    disabled: false,
    tooltip: "Home",
  },
  {
    title: "More",
    icon: moreTabIcon,
    activeIcon: selectedMoreTabIcon,
    path: "/more",
    disabled: false,
  },
];

export const BottomNav = () => {
  const [isAssetsOpen, setIsAssetsOpen] = useState(false);
  const { analyticsStore } = useStore();
  return !isAssetsOpen ? (
    <div className={style["bottomNavContainer"]}>
      <HomeTab />
      <StakeTab />
      <button
        style={{ cursor: "pointer" }}
        className={style["toggle"]}
        onClick={() => {
          setIsAssetsOpen(!isAssetsOpen);
          analyticsStore.logEvent("fund_transfer_tab_click");
        }}
      >
        <img src={require("@assets/svg/wireframe/openAsset.svg")} alt="" />
      </button>
      <ActivityTab />
      <MoreTab />
    </div>
  ) : (
    <WalletActions isOpen={isAssetsOpen} setIsOpen={setIsAssetsOpen} />
  );
};

const HomeTab = () => <Tab {...bottomNav[0]} />;
const StakeTab = () => {
  const { chainStore, queriesStore, accountStore } = useStore();
  const current = chainStore.current;
  const queries = queriesStore.get(current.chainId);
  const accountInfo = accountStore.getAccount(current.chainId);

  const rewards = queries.cosmos.queryRewards.getQueryBech32Address(
    accountInfo.bech32Address
  );

  const stakableReward = rewards.stakableReward;
  const rewardsBal = stakableReward.toString();
  const { numericPart: rewardsBalNumber } = separateNumericAndDenom(rewardsBal);

  const [stakingTooltip, setStakingTooltip] = useState("");
  const [stakingDisabled, setStakingDisabled] = useState(false);
  useEffect(() => {
    if (isFeatureAvailable(current.chainId)) {
      setStakingDisabled(false);
      setStakingTooltip("");
    } else {
      setStakingDisabled(true);
      setStakingTooltip("Feature not available on this network");
    }
  }, [current.chainId]);

  return (
    <React.Fragment>
      <Tab
        title={"Stake"}
        icon={stakeTabIcon}
        activeIcon={selectedStakeTabIcon}
        path={"/stake"}
        disabled={stakingDisabled}
        showDot={rewardsBalNumber > 0 && true}
        tooltip={stakingTooltip}
      />
    </React.Fragment>
  );
};

const ActivityTab = () => {
  const { chainStore } = useStore();
  const current = chainStore.current;
  const [activityTooltip, setActivityTooltip] = useState("");
  const [activityDisabled, setActivityDisabled] = useState(false);
  const isEvm = current.features?.includes("evm") ?? false;
  useEffect(() => {
    if (isEvm) {
      setActivityTooltip("Feature not available on this network");
      setActivityDisabled(true);
    } else {
      setActivityTooltip("");
      setActivityDisabled(false);
    }
  }, [current.chainId]);

  return (
    <Tab
      title={"Activity"}
      icon={activitygreyIcon}
      activeIcon={activityIcon}
      path={"/activity"}
      disabled={activityDisabled}
      tooltip={activityTooltip}
    />
  );
};
const MoreTab = () => <Tab {...bottomNav[1]} />;
