import React from "react";
import style from "./style.module.scss";
import { useNavigate } from "react-router";
import { ButtonV2 } from "@components-v2/buttons/button";

export const TransxFailed = () => {
  const navigate = useNavigate();

  return (
    <div className={style["container"]}>
      <img
        style={{ marginLeft: "14px", marginBottom: "-16px" }}
        src={require("@assets/svg/wireframe/transx-failed.svg")}
        alt=""
      />
      <div className={style["title"]}>Transaction Failed</div>
      <div className={style["text"]}>
        Unfortunately your transaction has failed.
      </div>
      <ButtonV2
        variant="dark"
        styleProps={{
          height: "56px",
        }}
        onClick={() => navigate("/send")}
        text={"Try again"}
      />
      <ButtonV2
        variant="dark"
        styleProps={{
          marginTop: "0px",
          height: "56px",
        }}
        onClick={() => navigate("/")}
        text={"Go to homescreen"}
      />
    </div>
  );
};
