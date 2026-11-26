import React from "react";
import style from "./style.module.scss";
import { Staking } from "@keplr-wallet/stores";

export const ChooseValidator = ({
  onClick,
  selectedValidator,
  validator,
}: {
  onClick: () => void;
  selectedValidator: Staking.Validator;
  validator: Staking.Validator;
}) => {
  return (
    <div
      className={style["choose-validator-outer-container"]}
      onClick={onClick}
    >
      <div
        style={{
          color: "rgba(255, 255, 255, 0.6)",
        }}
        className={style[`label`]}
      >
        To
      </div>

      <div
        style={{
          background: "rgba(255, 255, 255, 0.1)",
          border: "none",
        }}
        className={style["choose-validator-inner-container"]}
      >
        <React.Fragment>
          <div className={style["choose-validator-heading"]}>
            {selectedValidator
              ? selectedValidator !== validator
                ? selectedValidator.description.moniker
                : "Choose validator"
              : "Choose validator"}
          </div>
          <img src={require("@assets/svg/chevron-right.svg")} alt="" />
        </React.Fragment>
      </div>
    </div>
  );
};
