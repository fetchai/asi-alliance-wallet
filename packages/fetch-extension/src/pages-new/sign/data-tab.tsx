import React, { FunctionComponent, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { SignDocHelper } from "@keplr-wallet/hooks";
import { EthSignType } from "@keplr-wallet/types";
import style from "./style.module.scss";

export const DataTab: FunctionComponent<{
  signDocHelper?: SignDocHelper;
  ethSignType?: EthSignType;
  ethData?: unknown;
}> = observer(({ signDocHelper, ethSignType, ethData }) => {
  const content = useMemo(() => {
    try {
      if (signDocHelper) {
        const wrapper = signDocHelper.signDocWrapper;
        if (
          wrapper &&
          wrapper.mode === "amino" &&
          wrapper.aminoSignDoc.msgs.length === 1 &&
          wrapper.aminoSignDoc.msgs[0].type === "sign/MsgSignData"
        ) {
          const base64Data = wrapper.aminoSignDoc.msgs[0].value.data;

          const decoded = new TextDecoder().decode(
            Buffer.from(base64Data, "base64")
          );

          return JSON.stringify(JSON.parse(decoded), undefined, 2);
        }

        // Default Cosmos (direct / amino fallback)
        return JSON.stringify(signDocHelper.signDocJson, undefined, 2);
      }

      try {
        if (ethSignType) {
          if (ethSignType === EthSignType.TRANSACTION) {
            return JSON.stringify(JSON.parse(ethData as string), undefined, 2);
          } else {
            return JSON.stringify(ethData, undefined, 2);
          }
        }
      } catch {
        return JSON.stringify(ethData, undefined, 2);
      }

      return "No signing data available";
    } catch (e) {
      return "Failed to parse signing data";
    }
  }, [signDocHelper, ethSignType, ethData]);

  return <pre className={style["message"]}>{content}</pre>;
});
