import { Staking } from "@keplr-wallet/stores";
import React, { FunctionComponent } from "react";
import { useStore } from "../../../stores";
import { observer } from "mobx-react-lite";
import { Dec } from "@keplr-wallet/unit";
import { StakeValidatorCard } from "@components-v2/stake-validator-card";
import { shortenNumber } from "@utils/format";
import { NoResults } from "@components-v2/no-results";

type ValidatorData = Staking.Validator;

export const ValidatorsList = ({
  filteredValidators,
}: {
  filteredValidators: ValidatorData[];
}) => {
  return (
    <React.Fragment>
      {filteredValidators.length ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {filteredValidators.map((validator: ValidatorData) => (
            <ValidatorItem
              validatorAddress={validator.operator_address}
              key={validator.operator_address}
            />
          ))}
        </div>
      ) : (
        <NoResults message="No Validators found" />
      )}
    </React.Fragment>
  );
};

const ValidatorItem: FunctionComponent<{
  validatorAddress: string;
}> = observer(({ validatorAddress }) => {
  const { chainStore, queriesStore } = useStore();

  const queries = queriesStore.get(chainStore.current.chainId);

  const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Bonded
  );

  const unbondingValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonding
  );
  const unbondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonded
  );

  let status;
  let commisionRate;

  const validator =
    bondedValidators.getValidator(validatorAddress) ||
    unbondingValidators.getValidator(validatorAddress) ||
    unbondedValidators.getValidator(validatorAddress);

  if (validator) {
    status = validator.status.split("_")[2].toLowerCase();
    commisionRate = (
      parseFloat(validator.commission.commission_rates.rate) * 100
    ).toFixed(2);
  }

  const inflation = queries.cosmos.queryInflation;
  const { inflation: ARR } = inflation;
  const validatorCom: any = parseFloat(
    validator?.commission.commission_rates.rate || "0"
  );
  const APR = ARR.mul(new Dec(1 - validatorCom));

  return validator ? (
    <StakeValidatorCard
      heading={validator.description.moniker?.trim()}
      validatorAddress={validatorAddress}
      thumbnailUrl={bondedValidators.getValidatorThumbnail(
        validator.operator_address
      )}
      trailingIcon={
        <img src={require("../../../public/assets/svg/chevron-right.svg")} />
      }
      delegated={shortenNumber(validator.delegator_shares)}
      commission={commisionRate}
      status={status}
      apr={`${APR.maxDecimals(2).trim(true).toString()}%`}
      chainID={chainStore.current.chainId}
    />
  ) : null;
});
