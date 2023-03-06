import React, { FunctionComponent } from "react";
import style from "./style.module.scss";
export const PoweredByNote: FunctionComponent = () => {
  return (
    <div className={style.poweredByNoteContainer}>
      <p className={style.poweredByNoteText}>
        Powered by <img src={require("@assets/svg/notiphy-icon.svg")} />
      </p>
    </div>
  );
};
