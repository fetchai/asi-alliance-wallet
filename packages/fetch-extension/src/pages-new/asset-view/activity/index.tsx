import { observer } from "mobx-react-lite";
import React, { FunctionComponent } from "react";
import { NativeTab } from "./native";
import style from "./style.module.scss";

interface ActivityProps {
  token: string;
}
export const Activity: FunctionComponent<ActivityProps> = observer(
  ({ token }) => {
    return (
      <div className={style[""]}>
        {token === "FET" && (
          <div className={style["activity-tab"]}>
            <div className={style["heading"]}>Activity</div>
            <NativeTab />
          </div>
        )}
      </div>
    );
  }
);
