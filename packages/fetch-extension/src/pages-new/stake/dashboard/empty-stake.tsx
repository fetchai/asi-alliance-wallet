import React from "react";
import style from "../style.module.scss";
import { ButtonV2 } from "@components-v2/buttons/button";
import { useNavigate } from "react-router";
import { useStore } from "../../../stores";

export const EmptyStake = () => {
  const navigate = useNavigate();
  const { chainStore, analyticsStore } = useStore();
  return (
    <div className={style["empty-stake-container"]}>
      <div className={style["empty-stake-text"]}>
        <img src={require("@assets/svg/wireframe/ic_staking.svg")} alt="" />
        <div className={style["title-text"]}>Start staking now</div>
        <div className={style["subtitle-text"]}>
          Stack your assets to earn rewards and contribute to maintaining the
          networks
        </div>
      </div>

      <ButtonV2
        variant="dark"
        styleProps={{
          width: "90%",
          height: "56px",
          fontSize: "16px",
        }}
        text="Start staking"
        onClick={() => {
          analyticsStore.logEvent("stake_click", {
            chainId: chainStore.current.chainId,
            chainName: chainStore.current.chainName,
            pageName: "Stake",
          });
          navigate("/validator/validator-list");
        }}
      />
    </div>
  );
};
