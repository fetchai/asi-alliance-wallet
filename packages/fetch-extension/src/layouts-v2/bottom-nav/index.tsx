import activitygreyIcon from "@assets/svg/wireframe/new-clock.svg";
import selectedHomeTabIcon from "@assets/svg/wireframe/selected-home.svg";
import homeTabIcon from "@assets/svg/wireframe/new-home.svg";

import chatTabIcon from "@assets/svg/wireframe/new-inbox.svg";
import selectedChatTabIcon from "@assets/svg/wireframe/selected-inbox.svg";

import moreTabIcon from "@assets/svg/wireframe/new-more.svg";
import selectedMoreTabIcon from "@assets/svg/wireframe/selected-more.svg";

import agentIcon from "@assets/svg/wireframe/new-robot.svg";
import { store } from "@chatStore/index";
import {
  WalletConfig,
  notificationsDetails,
  setNotifications,
  userDetails,
  walletConfig,
} from "@chatStore/user-slice";
import { NotificationSetup } from "@notificationTypes";
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useStore } from "../../stores";
import style from "./style.module.scss";
import { Tab } from "./tab";
// import { CHAIN_ID_FETCHHUB } from "../../config.ui.var";

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
  return (
    <div className={style["bottomNavContainer"]}>
      <HomeTab />
      <ChatTab />
      <NotificationTab />
      <ActivityTab />
      <MoreTab />
    </div>
  );
};

const HomeTab = () => <Tab {...bottomNav[0]} />;
const NotificationTab = () => {
  const { keyRingStore, accountStore, chainStore } = useStore();
  const current = chainStore.current;
  const accountInfo = accountStore.getAccount(current.chainId);
  const config: WalletConfig = useSelector(walletConfig);
  const notificationInfo: NotificationSetup = useSelector(notificationsDetails);
  const [isComingSoon, setIsComingSoon] = useState<boolean>(true);

  useEffect(() => {
    if (keyRingStore.keyRingType === "ledger") {
      setIsComingSoon(true);
    } else {
      setIsComingSoon(
        config.notiphyWhitelist === undefined
          ? true
          : config.notiphyWhitelist.length !== 0 &&
              config.notiphyWhitelist.indexOf(accountInfo.bech32Address) === -1
      );
    }

    const notificationFlag =
      localStorage.getItem(`turnNotifications-${accountInfo.bech32Address}`) ||
      "true";
    const localNotifications = JSON.parse(
      localStorage.getItem(`notifications-${accountInfo.bech32Address}`) ||
        JSON.stringify([])
    );

    store.dispatch(
      setNotifications({
        allNotifications: localNotifications,
        unreadNotification: localNotifications.length > 0,
        isNotificationOn: notificationFlag == "true",
      })
    );
  }, [accountInfo.bech32Address, config.notiphyWhitelist]);

  return (
    <React.Fragment>
      {!isComingSoon &&
        notificationInfo.unreadNotification &&
        notificationInfo.isNotificationOn && (
          <span className={style["bellDot"]} />
        )}
      <Tab
        title={"Agents"}
        icon={agentIcon}
        path={"/notification"}
        disabled={true}
        tooltip={"Coming Soon"}
      />
    </React.Fragment>
  );
};
const ChatTab = () => {
  const { keyRingStore, chainStore } = useStore();
  const { hasFET, enabledChainIds } = useSelector(userDetails);
  const config: WalletConfig = useSelector(walletConfig);
  const current = chainStore.current;
  const [chatTooltip, setChatTooltip] = useState("");
  const [chatDisabled, setChatDisabled] = useState(false);

  useEffect(() => {
    if (keyRingStore.keyRingType === "ledger") {
      setChatTooltip("Coming soon for ledger");
      setChatDisabled(true);
      return;
    }

    if (config.requiredNative && !hasFET) {
      setChatTooltip("You need to have FET balance to use this feature");
      setChatDisabled(true);
      return;
    } else {
      setChatTooltip("");
      setChatDisabled(false);
    }

    if (!enabledChainIds.includes(current.chainId)) {
      setChatTooltip("Feature not available on this network");
      setChatDisabled(true);
      return;
    }
  }, [
    hasFET,
    enabledChainIds,
    config.requiredNative,
    keyRingStore.keyRingType,
    current.chainId,
  ]);

  return (
    <Tab
      title={"Chat"}
      icon={chatTabIcon}
      activeIcon={selectedChatTabIcon}
      path={"/chat"}
      disabled={chatDisabled}
      tooltip={chatTooltip}
    />
  );
};

const ActivityTab = () => {
  const { keyRingStore, chainStore } = useStore();
  const current = chainStore.current;
  const [activityTooltip, setActivityTooltip] = useState("");
  const [activityDisabled, setActivityDisabled] = useState(false);
  const isEvm = current.features?.includes("evm") ?? false;
  useEffect(() => {
    if (keyRingStore.keyRingType === "ledger") {
      setActivityTooltip("Coming soon for ledger");
      setActivityDisabled(true);
      return;
    }
    if (isEvm) {
      setActivityTooltip("Feature not available on this network");
      setActivityDisabled(true);
    } else {
      setActivityTooltip("");
      setActivityDisabled(false);
    }
  }, [current.chainId, keyRingStore.keyRingType]);

  return (
    <Tab
      title={"Activity"}
      icon={activitygreyIcon}
      path={"/activity"}
      disabled={activityDisabled}
      tooltip={activityTooltip}
    />
  );
};
const MoreTab = () => <Tab {...bottomNav[1]} />;