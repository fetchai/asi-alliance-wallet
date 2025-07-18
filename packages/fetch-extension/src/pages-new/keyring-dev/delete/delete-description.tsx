import React from "react";
import style from "./delete.module.scss";
import { FormattedMessage } from "react-intl";

export const DeleteDescription = () => {
  return (
    <div className={style["innerContainer"]}>
      <div className={style["imageContainer"]}>
        <img
          className={style["imgLock"]}
          src={require("@assets/svg/wireframe/deleteDark.svg")}
          alt="lock"
        />
      </div>
      <div className={style["heading"]}>Delete Wallet</div>
      <p className={style["subheading"]}>
        <FormattedMessage id="setting.clear.warning" />
      </p>
    </div>
  );
};
