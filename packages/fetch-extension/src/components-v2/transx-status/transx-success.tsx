import React from "react";
import style from "./style.module.scss";
import { useNavigate } from "react-router";
import { ButtonV2 } from "@components-v2/buttons/button";

export const TransxSuccess = () => {
  const navigate = useNavigate();
  return (
    <div className={style["container"]}>
      <img
        style={{ marginLeft: "14px" }}
        src={require("@assets/svg/wireframe/transx-success.svg")}
        alt=""
      />
      <div className={style["title"]}>Transaction Successful</div>
      <div className={style["text"]}>
        {" "}
        Congratulations! <br /> Your transaction has been completed and
        confirmed by the blockchain
      </div>
      <ButtonV2
        variant="dark"
        styleProps={{
          height: "56px",
        }}
        onClick={() => navigate("/")}
        text={"Go to homescreen"}
      />
      <ButtonV2
        variant="dark"
        styleProps={{
          height: "56px",
          marginTop: 0,
        }}
        onClick={() => navigate("/activity")}
        text={"View Details"}
      />
    </div>
  );
};
