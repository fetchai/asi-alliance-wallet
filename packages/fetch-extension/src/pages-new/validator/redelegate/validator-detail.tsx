import React from "react";
import { ButtonV2 } from "@components-v2/buttons/button";
import { ValidatorData } from "@components-v2/validator-data";
import { useStore } from "../../../stores";

export const RedelegateValidatorDetail = ({
  validatorAddress,
  onClick,
}: {
  validatorAddress: string;
  onClick: () => void;
}) => {
  const { analyticsStore } = useStore();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        height: "520px",
        position: "relative",
      }}
    >
      <ValidatorData validatorAddress={validatorAddress} />
      <ButtonV2
        styleProps={{
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: "0px",
          position: "absolute",
          bottom: "10px",
        }}
        text="Choose this validator"
        onClick={() => {
          onClick();
          analyticsStore.logEvent("choose_validator_click", {
            pageName: "Validator Details",
          });
        }}
      />
    </div>
  );
};
