import React, { FunctionComponent, useCallback } from "react";
import { ButtonV2 } from "@components-v2/buttons/button";

import { FormattedMessage } from "react-intl";

import style from "./style.module.scss";

export const ConfirmDialog: FunctionComponent<{
  img?: React.ReactElement;
  title?: string;
  paragraph: string;

  yes?: string;
  no?: string;
  hideNoButton?: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
}> = ({
  img: imgElement,
  title,
  paragraph,
  yes,
  no,
  hideNoButton = false,
  onConfirm,
  onReject,
}) => {
  return (
    <div className={style["dialog"]}>
      <div className={style["bodyContainer"]}>
        {imgElement ? imgElement : null}
        {title ? <h1>{title}</h1> : null}
        <p>{paragraph}</p>
      </div>
      <div className={style["buttons"]}>
        {!hideNoButton && (
          <ButtonV2
            text={no ? no : <FormattedMessage id="confirm.no" />}
            styleProps={{
              padding: "10px",
              height: "40px",
              fontSize: "0.9rem",
              background: "transparent",
              color: "white",
              border: "1px solid rgba(255,255,255,0.4)",
            }}
            onClick={(e: any) => {
              if (onReject) {
                onReject();
              }
              e.preventDefault();
            }}
          />
        )}
        <ButtonV2
          text={yes ? yes : <FormattedMessage id="confirm.yes" />}
          styleProps={{
            padding: "10px",
            height: "40px",
            fontSize: "0.9rem",
            background: "white",
            color: "black",
            border: "1px solid rgba(255,255,255,0.4)",
          }}
          onClick={useCallback(
            (e: any) => {
              if (onConfirm) {
                onConfirm();
              }
              e.preventDefault();
            },
            [onConfirm]
          )}
        />
      </div>
    </div>
  );
};
