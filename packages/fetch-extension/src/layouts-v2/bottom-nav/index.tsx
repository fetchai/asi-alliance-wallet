import activityIcon from "@assets/svg/wireframe/clock.svg";
import activitygreyIcon from "@assets/svg/wireframe/new-clock.svg";

import homeTabIcon from "@assets/svg/wireframe/wallet-new.svg";
import moreTabIcon from "@assets/svg/wireframe/new-more.svg";
import selectedHomeTabIcon from "@assets/svg/wireframe/new-home.svg";
import selectedMoreTabIcon from "@assets/svg/wireframe/selected-more.svg";
import selectedStakeTabIcon from "@assets/svg/wireframe/selected-stake.svg";
import stakeTabIcon from "@assets/svg/wireframe/stake-bottom-icon-new.svg";
import React, { useEffect, useState } from "react";

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
  const { chainStore } = useStore();
  const current = chainStore.current;
  const isEvm = current.features?.includes("evm") ?? false;

  const [stakingTooltip, setStakingTooltip] = useState("");
  const [stakingDisabled, setStakingDisabled] = useState(false);
  useEffect(() => {
    if (isEvm || current.chainId === "noble-1") {
      setStakingDisabled(true);
      setStakingTooltip("Feature not available on this network");
    } else {
      setStakingDisabled(false);
      setStakingTooltip("");
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
