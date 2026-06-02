import React, { FunctionComponent } from "react";
import { IFeeConfig, IGasConfig, IGasSimulator } from "@keplr-wallet/hooks";
import { observer } from "mobx-react-lite";
import { GasAutoContainer } from "./auto";
import { ManualFeeInput } from "./manual";
import styleContainer from "./container.module.scss";
import { Alert } from "reactstrap";
import { ToggleSwitchButton } from "@components-v2/buttons/toggle-switch-button";

export const GasContainer: FunctionComponent<{
  label?: string;
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;

  gasSimulator: IGasSimulator & {
    outdatedCosmosSdk?: boolean;
    forceDisabled?: boolean;
    forceDisableReason?: Error | undefined;
  };
}> = observer(({ feeConfig, gasConfig, gasSimulator }) => {
  return (
    <div className={styleContainer["container"]}>
      <div className={styleContainer["autoButtonGroup"]}>
        <div className={styleContainer["label"]}>Auto</div>

        <ToggleSwitchButton
          checked={gasSimulator.enabled}
          onChange={() => {
            if (!gasSimulator.forceDisabled) {
              gasSimulator.setEnabled(!gasSimulator.enabled);
            }
          }}
        />
      </div>
      {gasSimulator.outdatedCosmosSdk ? (
        <Alert color="warning">
          Gas estimation is not supported, because this chain uses outdated
          cosmos-sdk
        </Alert>
      ) : null}
      {gasSimulator.forceDisabled && gasSimulator.forceDisableReason ? (
        <Alert color="warning">{gasSimulator.forceDisableReason.message}</Alert>
      ) : null}
      {gasSimulator.enabled ? (
        <GasAutoContainer gasConfig={gasConfig} gasSimulator={gasSimulator} />
      ) : (
        <ManualFeeInput
          feeConfig={feeConfig}
          gasConfig={gasConfig}
          gasSimulator={gasSimulator}
        />
      )}
    </div>
  );
});
