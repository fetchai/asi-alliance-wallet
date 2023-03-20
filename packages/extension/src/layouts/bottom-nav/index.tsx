import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { userDetails } from "@chatStore/user-slice";
import { CHAIN_ID_FETCHHUB } from "../../config.ui.var";
import chatTabBlueIcon from "@assets/icon/chat-blue.png";
import chatTabGreyIcon from "@assets/icon/chat-grey.png";
import clockTabBlueIcon from "@assets/icon/clock-blue.png";
import clockTabGreyIcon from "@assets/icon/clock-grey.png";
import homeTabBlueIcon from "@assets/icon/home-blue.png";
import homeTabGreyIcon from "@assets/icon/home-grey.png";
import moreTabBlueIcon from "@assets/icon/more-blue.png";
import moreTabGreyIcon from "@assets/icon/more-grey.png";
import { useStore } from "../../stores";
import style from "./style.module.scss";
import { Tab } from "./tab";

const bottomNav = [
  {
    title: "Home",
    icon: homeTabGreyIcon,
    activeTabIcon: homeTabBlueIcon,
    path: "/",
    disabled: false,
    tooltip: "Home",
  },
  {
    title: "Activity",
    icon: clockTabGreyIcon,
    activeTabIcon: clockTabBlueIcon,
    path: "/activity",
    disabled: true,
    tooltip: "Coming Soon",
  },
  {
    title: "More",
    icon: moreTabGreyIcon,
    activeTabIcon: moreTabBlueIcon,
    path: "/more",
    disabled: false,
  },
];

export const BottomNav = () => {
  return (
    <div className={style.bottomNavContainer}>
      <HomeTab />
      <ActivityTab />
      <ChatTab />
      <MoreTab />
    </div>
  );
};

const HomeTab = () => <Tab {...bottomNav[0]} />;
const ActivityTab = () => <Tab {...bottomNav[1]} />;
const ChatTab = () => {
  const { chainStore } = useStore();
  const {
    isChatActive,
    requiredFET,
    currentFET,
    enabledChainIds,
  } = useSelector(userDetails);
  const [chatTooltip, setChatTooltip] = useState("");
  const [chatDisabled, setChatDisabled] = useState(false);
  const current = chainStore.current;

  useEffect(() => {
    if (!isChatActive) {
      setChatTooltip("Chat Feature is currently Disabled");
      return;
    }
    if (!requiredFET > currentFET) {
      setChatTooltip("You need to have FET balance to use this feature");
      return;
    }
    if (!enabledChainIds.include(current?.chainId))
      setChatTooltip("Feature not available on this network");

    if (process.env.NODE_ENV === "production")
      setChatDisabled(current?.chainId !== CHAIN_ID_FETCHHUB || !isChatActive);
  }, [current.chainId, currentFET, enabledChainIds, isChatActive, requiredFET]);

  return (
    <Tab
      title={"Chat"}
      icon={chatTabGreyIcon}
      activeTabIcon={chatTabBlueIcon}
      path={"/chat"}
      disabled={chatDisabled}
      tooltip={chatTooltip}
    />
  );
};
const MoreTab = () => <Tab {...bottomNav[2]} />;
