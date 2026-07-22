import React, { FunctionComponent, useEffect, useState } from "react";
import { CardModal } from "modals/card";
import { useStyle } from "styles/index";
import {
  FeeButtons,
  FeeButtonsInner,
} from "../fee-button/fee-button-component";
import {
  FeeType,
  IFeeConfig,
  IGasConfig,
  IGasSimulator,
} from "@keplr-wallet/hooks";
import { Button } from "components/button";
import { ViewStyle } from "react-native";
import { observer } from "mobx-react-lite";

export const TransactionFeeModel: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  title: string;
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;
  gasSimulator?: IGasSimulator;
  feeButtonInner?: boolean;
}> = observer(
  ({
    close,
    title,
    isOpen,
    feeConfig,
    gasConfig,
    gasSimulator,
    feeButtonInner = false,
  }) => {
    const style = useStyle();
    const [selectFeeButton, setSelectFeeButton] = useState<FeeType>(
      feeConfig.feeType ? feeConfig.feeType : "average"
    );
    const [hasManualFeeError, setHasManualFeeError] = useState(false);

    useEffect(() => {
      setSelectFeeButton(feeConfig.feeType ? feeConfig.feeType : "average");
      setHasManualFeeError(false);
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
            gasSimulator={gasSimulator}
            setFeeButton={setSelectFeeButton}
            selectFeeButton={selectFeeButton}
            onValidationChange={setHasManualFeeError}
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
            {
              ...style.flatten([
                "margin-top-24",
                "border-radius-32",
                "background-color-dark",
              ]),
              ...(hasManualFeeError && { opacity: 0.8 }),
            } as ViewStyle
          }
          textStyle={style.flatten(["body2", "color-white"]) as ViewStyle}
          rippleColor="#333333"
          disabled={hasManualFeeError}
          onPress={() => {
            if (!feeConfig.isManual) {
              feeConfig.setFeeType(selectFeeButton);
            }
            close();
          }}
        />
      </CardModal>
    );
  }
);
