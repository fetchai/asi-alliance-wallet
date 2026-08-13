import React from "react";
import { Button } from "reactstrap";
import style from "./style.module.scss";

const MESSAGE_ICONS: Record<string, string> = {
  error: require("../../public/assets/svg/error.svg"),
};

interface Props {
  type?: "error";
  onClose(): void;
  children: any;
}

export function Message({ type, onClose, children }: Props) {
  return (
    <div className={style["modal"]}>
      <div className={style["modalContent"]}>
        {type && MESSAGE_ICONS[type] && (
          <img
            className={style["messageIcon"]}
            src={MESSAGE_ICONS[type]}
            height="64"
          />
        )}
        <div className={style["messageContent"]}>{children}</div>
        <Button
          className={style["messageButton"]}
          color="primary"
          block
          onClick={onClose}
        >
          OK
        </Button>
      </div>
    </div>
  );
}
