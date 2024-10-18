import React, { FunctionComponent } from "react";
import { CardModal } from "../card";
import { useStore } from "stores/index";
import { observer } from "mobx-react-lite";
import { SuggestChainPageImpl } from "modals/chain-suggestion/suggestion-chain";

export const SuggestChainModal: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
}> = observer(({ isOpen, close }) => {
  const { chainSuggestStore } = useStore();
  const waitingData = chainSuggestStore.waitingSuggestedChainInfo;
  if (!isOpen || !waitingData) {
    return null;
  }
  return (
    <CardModal
      isOpen={isOpen}
      showCloseButton={false}
      disableGesture={true}
      close={close}
    >
      <SuggestChainPageImpl key={waitingData.id} waitingData={waitingData} />
    </CardModal>
  );
});
