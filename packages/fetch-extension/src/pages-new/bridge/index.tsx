import React, { FunctionComponent } from "react";
import { useNavigate } from "react-router";
import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { BridgeSupportedContent } from "./bridge-supported-content";
import { BridgeUnsupportedState } from "./bridge-unsupported-state";
import { getNativeBridgeModeByChainId } from "@utils/native-bridge-mode";

export const BridgePage: FunctionComponent = observer(() => {
  const { chainStore } = useStore();
  const navigate = useNavigate();

  const mode = getNativeBridgeModeByChainId(chainStore.current.chainId);

  return (
    <HeaderLayout
      showTopMenu={true}
      smallTitle={true}
      showChainName={false}
      showBottomMenu={false}
      alternativeTitle={"Bridge"}
      canChangeChainInfo={false}
      onBackButton={() => {
        navigate(-1);
      }}
    >
      {mode === "none" ? (
        <BridgeUnsupportedState />
      ) : mode === "ethereum" ? (
        <BridgeSupportedContent mode="ethereum" />
      ) : (
        <BridgeSupportedContent mode="fetchhub" />
      )}
    </HeaderLayout>
  );
});
