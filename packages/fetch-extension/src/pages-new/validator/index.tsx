import { HeaderLayout } from "@layouts-v2/header-layout";
import React, { FunctionComponent, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { useStore } from "../../stores";
import { Staking } from "@keplr-wallet/stores";
import { observer } from "mobx-react-lite";
import { ValidatorDetails } from "./validator-detail";
import style from "./validator-detail/style.module.scss";

export const Validator: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const validatorAddress = location.pathname.split("/")[2];

  const previousAddress = location.state?.previousAddress || "";

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

  const { validator } = useMemo(() => {
    const validator =
      bondedValidators.getValidator(validatorAddress) ||
      unbondingValidators.getValidator(validatorAddress) ||
      unbondedValidators.getValidator(validatorAddress);
    return {
      validator,
    };
  }, [
    validatorAddress,
    bondedValidators,
    unbondingValidators,
    unbondedValidators,
  ]);

  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={`Staking on ${
        validator && validator.description.moniker
          ? validator.description.moniker
          : validator?.description.website
      }`}
      headerTitleClass={validator ? style["header-title"] : ""}
      showBottomMenu={false}
      onBackButton={() =>
        previousAddress === "stake"
          ? navigate("/stake")
          : navigate("/validator/validator-list")
      }
    >
      {validator && <ValidatorDetails validatorAddress={validatorAddress} />}
    </HeaderLayout>
  );
});
