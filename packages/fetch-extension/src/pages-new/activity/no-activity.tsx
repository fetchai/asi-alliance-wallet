import React from "react";
import style from "./style.module.scss";
export const NoActivity = ({ label }: { label: string }) => {
  return (
    <div className={style["noActivityContainer"]}>
      <img src={require("@assets/svg/wireframe/no-activity.svg")} alt="" />
      <div className={style["noActivityTitle"]}>{label}</div>
      <div className={style["content"]}>
        Your transactions will appear here when you start using your wallet
      </div>
    </div>
  );
};
