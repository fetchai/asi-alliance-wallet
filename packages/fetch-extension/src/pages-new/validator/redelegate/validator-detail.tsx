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
      }}
    >
      <ValidatorData validatorAddress={validatorAddress} />
      <ButtonV2
        styleProps={{
          width: "94%",
          height: "56px",
          margin: "0px auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: "0px",
          position: "absolute",
          bottom: "15px",
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
