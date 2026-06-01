import React, { FunctionComponent } from "react";
import style from "./style.module.scss";
import { useNavigate } from "react-router";

export const BridgeUnsupportedState: FunctionComponent = () => {
  const navigate = useNavigate();

  return (
    <div className={style["unsupportedBridge"]}>
      <p className={style["unsupportedBridgeTitle"]}>
        Bridge is not available on this network.
      </p>
      <p className={style["unsupportedBridgeHint"]}>
        Go back and switch to Ethereum or Fetchhub to use the native bridge.
      </p>
      <button
        type="button"
        className={style["unsupportedBridgeSend"]}
        onClick={() => navigate("/send")}
      >
        Send
      </button>
    </div>
  );
};
