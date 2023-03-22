/* eslint-disable react-hooks/exhaustive-deps */
import chevronLeft from "@assets/icon/chevron-left.png";
import { AgentInitPopup } from "@components/agents/agent-init-popup";
import { ToolTip } from "@components/tooltip";
import { formatAddress } from "@utils/format";
import React, { useEffect, useState } from "react";
import { useHistory } from "react-router";
import { useStore } from "../../stores";
import style from "./style.module.scss";

export const UserNameSection = () => {
  const history = useHistory();

  const userName = history.location.pathname.split("/")[2];
  const { chainStore, accountStore } = useStore();
  const walletAddress = accountStore.getAccount(chainStore.current.chainId)
    .bech32Address;
  const [openDialog, setIsOpendialog] = useState(false);

  useEffect(() => {
    const addresses = localStorage.getItem("fetchAgentInfoSeen") || "";
    if (walletAddress) setIsOpendialog(!addresses.includes(walletAddress));
  }, [walletAddress]);

  const handleClose = () => {
    const addresses = localStorage.getItem("fetchAgentInfoSeen") || "";
    localStorage.setItem(
      "fetchAgentInfoSeen",
      addresses + `[${walletAddress}]`
    );
    setIsOpendialog(false);
  };

  return (
    <div className={style.username}>
      {openDialog && <AgentInitPopup handleClose={handleClose} />}
      <div className={style.leftBox}>
        <img
          alt=""
          draggable="false"
          className={style.backBtn}
          src={chevronLeft}
          onClick={() => {
            history.goBack();
          }}
        />
        <img src={require("@assets/svg/fetchbot.svg")} width="25px" />
        <span className={style.recieverName}>
          <ToolTip
            tooltip={
              <div className={style.user} style={{ minWidth: "300px" }}>
                {userName}
              </div>
            }
            theme="dark"
            trigger="hover"
            options={{
              placement: "top",
            }}
          >
            {formatAddress(userName)}
          </ToolTip>
        </span>
        <span className={style.copyIcon} onClick={() => setIsOpendialog(true)}>
          <i className="fa fa-info-circle" />
        </span>
      </div>
      <div className={style.rightBox} />
    </div>
  );
};
