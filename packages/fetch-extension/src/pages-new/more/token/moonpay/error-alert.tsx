import React, { FunctionComponent } from "react";
import { Alert } from "reactstrap";
import style from "./style.module.scss";

export const ErrorAlert: FunctionComponent<{
  title: string;
  subtitle?: string;
}> = ({ title, subtitle }) => {
  return (
    <Alert className={style["alert"]}>
      <img src={require("@assets/svg/wireframe/alert.svg")} alt="" />
      <div
        className={style["alertContent"]}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <div className={style["text"]}>{title}</div>
        {subtitle && <p className={style["lightText"]}>{subtitle}</p>}
      </div>
    </Alert>
  );
};
