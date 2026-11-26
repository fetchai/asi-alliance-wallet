import React, { FunctionComponent, useEffect, useState } from "react";
import { CardModal } from "modals/card";
import { useStyle } from "styles/index";
import {
  FeeButtons,
  FeeButtonsInner,
} from "../fee-button/fee-button-component";
import { FeeType, IFeeConfig, IGasConfig } from "@keplr-wallet/hooks";
import { Button } from "components/button";
import { ViewStyle } from "react-native";
import { observer } from "mobx-react-lite";

export const TransactionFeeModel: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  title: string;
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;
  feeButtonInner?: boolean;
}> = observer(
  ({ close, title, isOpen, feeConfig, gasConfig, feeButtonInner = false }) => {
    const style = useStyle();
    const [selectFeeButton, setSelectFeeButton] = useState<FeeType>(
      feeConfig.feeType ? feeConfig.feeType : "average"
    );

    useEffect(() => {
      setSelectFeeButton(feeConfig.feeType ? feeConfig.feeType : "average");
    }, [isOpen]);

    if (!isOpen) {
      return null;
    }
    return (
      <CardModal isOpen={isOpen} close={close} title={title}>
        {!feeButtonInner ? (
          <FeeButtons
            label="Fee"
            gasLabel="gas"
            feeConfig={feeConfig}
            gasConfig={gasConfig}
            setFeeButton={setSelectFeeButton}
            selectFeeButton={selectFeeButton}
          />
        ) : (
          <FeeButtonsInner
            label="Fee"
            gasLabel="gas"
            feeConfig={feeConfig}
            gasConfig={gasConfig}
            setFeeButton={setSelectFeeButton}
            selectFeeButton={selectFeeButton}
          />
        )}
        <Button
          text="Save changes"
          containerStyle={
            style.flatten(["margin-top-24", "border-radius-32"]) as ViewStyle
          }
          textStyle={style.flatten(["body2"]) as ViewStyle}
          onPress={() => {
            feeConfig.setFeeType(selectFeeButton);
            close();
          }}
        />
      </CardModal>
    );
  }
);
