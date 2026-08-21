import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";
import { SignDocHelper } from "@keplr-wallet/hooks";
import { EthSignType } from "@keplr-wallet/types";
import style from "./style.module.scss";

export const DataTab: FunctionComponent<{
  signDocHelper?: SignDocHelper;
  ethSignType?: EthSignType;
  ethData?: unknown;
}> = observer(({ signDocHelper, ethSignType, ethData }) => {
  let content = "No signing data available";

  try {
    if (signDocHelper) {
      // Full amino/direct SignDoc (including ADR-36 MsgSignData with base64 data).
      content = JSON.stringify(signDocHelper.signDocJson, undefined, 2);
    } else if (ethSignType) {
      try {
        if (ethSignType === EthSignType.TRANSACTION) {
          content = JSON.stringify(JSON.parse(ethData as string), undefined, 2);
        } else {
          content = JSON.stringify(ethData, undefined, 2);
        }
      } catch {
        content = JSON.stringify(ethData, undefined, 2);
      }
    }
  } catch {
    content = "Failed to parse signing data";
  }

  return <pre className={style["message"]}>{content}</pre>;
});
