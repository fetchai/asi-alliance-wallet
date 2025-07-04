import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";
import styleAuto from "./auto.module.scss";
import { Input } from "../input";
import { IGasConfig, IGasSimulator } from "@keplr-wallet/hooks";
import { Card } from "@components-v2/card";

export const GasAutoContainer: FunctionComponent<{
  gasConfig: IGasConfig;
  gasSimulator: IGasSimulator;
}> = observer(({ gasConfig, gasSimulator }) => {
  return (
    <div className={styleAuto["container"]}>
      <div className={styleAuto["gasAdjustmentContainer"]}>
        <div
          style={{
            color: "white",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div
            style={{
              color: "var(--font-secondary)",
              fontSize: "14px",
              fontWeight: 400,
            }}
          >
            Gas Adjustment
          </div>
          <Card
            style={{
              background: "#ffffff",
              border: "1px solid var(--bg-grey-dark)",
              padding: "12px 18px",
              height: "48px",
            }}
            headingStyle={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            heading={
              <Input
                style={{ background: "transparent" }}
                className={styleAuto["input"]}
                value={
                  gasSimulator.gasEstimated != null
                    ? gasSimulator.gasAdjustmentRaw
                    : "-"
                }
                type={gasSimulator.gasEstimated != null ? "number" : "text"}
                readOnly={gasSimulator.gasEstimated == null}
                step={0.1}
                onChange={(e) => {
                  e.preventDefault();

                  gasSimulator.setGasAdjustment(e.target.value);
                }}
              />
            }
          />
        </div>

        <div
          style={{
            color: "white",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div
            style={{
              color: "var(--font-secondary)",
              fontSize: "14px",
              fontWeight: 400,
            }}
          >
            Estimated
          </div>
          <Card
            style={{
              background: "#ffffff",
              border: "1px solid var(--bg-grey-dark)",
              padding: "12px 18px",
              height: "48px",
            }}
            heading={
              <Input
                style={{ background: "transparent" }}
                className={styleAuto["input"]}
                readOnly={true}
                value={gasSimulator.gasEstimated ?? "-"}
              />
            }
          />
        </div>
      </div>

      <div
        style={{
          color: "white",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <div
          style={{
            color: "var(--font-secondary)",
            fontSize: "14px",
            fontWeight: 400,
          }}
        >
          Gas amount
        </div>
        <Card
          style={{
            background: "#ffffff",
            border: "1px solid var(--bg-grey-dark)",
            padding: "12px 18px",
            height: "48px",
          }}
          heading={
            <Input
              style={{ background: "transparent" }}
              className={styleAuto["input"]}
              readOnly={true}
              value={gasConfig.gas}
            />
          }
        />
      </div>
    </div>
  );
});
