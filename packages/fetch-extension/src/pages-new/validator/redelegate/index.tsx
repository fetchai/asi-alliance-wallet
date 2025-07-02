import { ButtonV2 } from "@components-v2/buttons/button";
import { UseMaxButton } from "@components-v2/buttons/use-max-button";
import { Dropdown } from "@components-v2/dropdown";
import { MemoInput } from "@components-v2/form";
import { StakeInput } from "@components-v2/form/stake-input";
import { SelectorModal } from "@components-v2/selector-modal/selector";
import { useNotification } from "@components/notification";
import { useRedelegateTxConfig } from "@keplr-wallet/hooks";
import { Staking } from "@keplr-wallet/stores";
import { CoinPretty, Dec, Int } from "@keplr-wallet/unit";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { observer } from "mobx-react-lite";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { FormGroup } from "reactstrap";
import { InputField } from "../../../components-v2/input-field";
import { useStore } from "../../../stores";
import { ChooseValidator } from "./choose-validator";
import { SelectValidatorList } from "./select-validator-list";
import style from "./style.module.scss";
import { RedelegateValidatorDetail } from "./validator-detail";
import { TXNTYPE } from "../../../config";
import { useIntl } from "react-intl";
import { useLanguage } from "../../../languages";
import { navigateOnTxnEvents } from "@utils/navigate-txn-event";

type Sort = "APR" | "Voting Power" | "Name";

export const Redelegate = observer(() => {
  const location = useLocation();
  const validatorAddress = location.pathname.split("/")[2];

  const language = useLanguage();
  const fiatCurrency = language.fiatCurrency;

  const navigate = useNavigate();
  const {
    chainStore,
    accountStore,
    queriesStore,
    analyticsStore,
    priceStore,
    activityStore,
  } = useStore();
  const account = accountStore.getAccount(chainStore.current.chainId);

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

  const validatorsList = [
    ...bondedValidators.validators,
    ...unbondedValidators.validators,
    ...unbondingValidators.validators,
  ].filter((validator) => validator.operator_address != validatorAddress);

  const [selectedValidator, setSelectedValidator] = useState<Staking.Validator>(
    validatorsList[0]
  );
  const [clickedValidator, setClickedValidator] = useState<Staking.Validator>(
    validatorsList[0]
  );

  const [showValidatorDropdown, setShowValidatorDropdown] = useState(false);
  const [showValidatorListDropDown, setShowValidatorListDropDown] =
    useState(false);

  const [sort, setSort] = useState<Sort>("Voting Power");
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);

  useEffect(() => {
    if (isSortModalOpen) {
      setShowValidatorListDropDown(false);
    }
  }, [isSortModalOpen]);

  const sendConfigs = useRedelegateTxConfig(
    chainStore,
    queriesStore,
    accountStore,
    chainStore.current.chainId,
    account.bech32Address,
    validatorAddress
  );
  const { amountConfig, memoConfig, feeConfig } = sendConfigs;

  const [isToggleClicked, setIsToggleClicked] = useState<boolean>(false);
  const [inputInFiatCurrency, setInputInFiatCurrency] = useState<
    string | undefined
  >("");

  const stakedAmount = queriesStore
    .get(amountConfig.chainId)
    .cosmos.queryDelegations.getQueryBech32Address(amountConfig.sender)
    .getDelegationTo(validatorAddress);

  useEffect(() => {
    sendConfigs.recipientConfig.setRawRecipient(
      selectedValidator?.operator_address
    );
  }, [selectedValidator, sendConfigs.recipientConfig]);

  const sendConfigError =
    sendConfigs.recipientConfig.error ??
    sendConfigs.amountConfig.error ??
    sendConfigs.memoConfig.error ??
    sendConfigs.gasConfig.error ??
    sendConfigs.feeConfig.error;
  const txStateIsValid = sendConfigError == null;

  const queryBalances = queriesStore
    .get(sendConfigs.amountConfig.chainId)
    .queryBalances.getQueryBech32Address(sendConfigs.amountConfig.sender);

  const queryBalance = queryBalances.balances.find(
    (bal) =>
      sendConfigs.amountConfig.sendCurrency.coinMinimalDenom ===
      bal.currency.coinMinimalDenom
  );
  const balance = queryBalance
    ? queryBalance.balance
    : new CoinPretty(sendConfigs.amountConfig.sendCurrency, new Int(0));

  const convertToUsd = (currency: any) => {
    const value = priceStore.calculatePrice(currency, fiatCurrency);
    return value && value.shrink(true).maxDecimals(6).toString();
  };

  useEffect(() => {
    const inputValueInUsd = convertToUsd(balance);
    setInputInFiatCurrency(inputValueInUsd);
  }, [sendConfigs.amountConfig.amount]);

  const FiatCurrency = inputInFiatCurrency
    ? ` (${inputInFiatCurrency} ${fiatCurrency.toUpperCase()})`
    : "";

  const availableBalance = `${balance
    .trim(true)
    .shrink(true)
    .maxDecimals(6)
    .toString()}${FiatCurrency}`;

  const notification = useNotification();

  const txnResult = {
    onBroadcasted: () => {
      notification.push({
        type: "primary",
        placement: "top-center",
        duration: 2,
        content: `Transaction broadcasted`,
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });

      analyticsStore.logEvent("redelegate_txn_broadcasted", {
        chainId: chainStore.current.chainId,
        chainName: chainStore.current.chainName,
        validatorName: validator?.description.moniker,
        toValidatorName: validator?.description.moniker,
        feeType: sendConfigs.feeConfig.feeType,
      });
    },
    onFulfill: (tx: any) => {
      const istxnSuccess = tx.code ? false : true;
      notification.push({
        type: istxnSuccess ? "success" : "danger",
        placement: "top-center",
        duration: 5,
        content: istxnSuccess
          ? `Transaction Completed`
          : `Transaction Failed: ${tx.log}`,
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });
    },
  };

  const redelegateClicked = async () => {
    try {
      analyticsStore.logEvent("redelegate_txn_click", {
        pageName: "Stake Validator",
      });
      await account.cosmos
        .makeBeginRedelegateTx(
          amountConfig.amount,
          validatorAddress,
          selectedValidator.operator_address
        )
        .send(feeConfig.toStdFee(), memoConfig.memo, undefined, txnResult);
    } catch (e) {
      notification.push({
        type: "danger",
        placement: "top-center",
        duration: 5,
        content: `Transaction Failed`,
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });
      analyticsStore.logEvent("redelegate_txn_broadcasted_fail", {
        chainId: chainStore.current.chainId,
        chainName: chainStore.current.chainName,
        feeType: sendConfigs.feeConfig.feeType,
        message: e?.message ?? "",
      });
    } finally {
      const txnNavigationOptions = {
        redirect: () => {
          navigate("/activity", { replace: true });
        },
        txType: TXNTYPE.redelegate,
        txInProgress: account.txInProgress,
      };
      setTimeout(() => {
        navigateOnTxnEvents(txnNavigationOptions);
      }, 200);
    }
  };

  const apr = queries.cosmos.queryInflation.inflation;

  const items = useMemo(() => {
    // If inflation is 0 or not fetched properly, there is no need to sort by APY.
    if (apr.toDec().gt(new Dec(0))) {
      return [
        {
          label: "APR",
          key: "APR",
          icon: require("@assets/svg/wireframe/percentage.svg"),
        },
        {
          label: "Voting Power",
          key: "Voting Power",
          icon: require("@assets/svg/wireframe/voting-power.svg"),
        },
        {
          label: "Name",
          key: "Name",
          icon: require("@assets/svg/wireframe/user.svg"),
        },
      ];
    } else {
      return [
        {
          label: "Voting Power",
          key: "Voting Power",
          icon: require("@assets/svg/wireframe/voting-power.svg"),
        },
        {
          label: "Name",
          key: "Name",
          icon: require("@assets/svg/wireframe/user.svg"),
        },
      ];
    }
  }, [apr]);

  const intl = useIntl();

  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={`Redelegate`}
      showBottomMenu={false}
      onBackButton={() => navigate(-1)}
    >
      {validator && (
        <FormGroup
          style={{
            borderRadius: "0%",
            marginBottom: "2px",
            paddingBottom: "64px",
          }}
        >
          <div className={style["redelegate-container"]}>
            <div className={style["current-stake"]}>
              <div className={style["current-stake-label"]}>
                {intl.formatMessage({
                  id: "unstake.current-staked",
                })}
              </div>
              <div className={style["current-stake-value"]}>
                {stakedAmount.maxDecimals(4).trim(true).toString()}
              </div>
            </div>

            <InputField
              label="From"
              disabled={true}
              inputContainerClassName={style["fromValidatorInput"]}
              value={validator.description.moniker}
            />

            <ChooseValidator
              onClick={() => setShowValidatorListDropDown(true)}
              selectedValidator={selectedValidator}
              validator={validator}
            />

            <div>
              <StakeInput
                label="Amount"
                amountConfig={sendConfigs.amountConfig}
                isToggleClicked={isToggleClicked}
                availableBalance={availableBalance}
              />

              <UseMaxButton
                amountConfig={sendConfigs.amountConfig}
                isToggleClicked={isToggleClicked}
                setIsToggleClicked={setIsToggleClicked}
              />

              <MemoInput memoConfig={sendConfigs.memoConfig} />
            </div>
            <ButtonV2
              variant="dark"
              text=""
              styleProps={{
                width: "94%",
                padding: "12px",
                height: "56px",
                margin: "0 auto",
                position: "fixed",
                bottom: "15px",
                left: "0px",
                right: "0px",
              }}
              disabled={
                !account.isReadyToSendTx ||
                !txStateIsValid ||
                activityStore.getPendingTxnTypes[TXNTYPE.redelegate]
              }
              onClick={() => {
                if (activityStore.getPendingTxnTypes[TXNTYPE.redelegate])
                  return;
                redelegateClicked();
              }}
              btnBgEnabled={true}
            >
              {intl.formatMessage({
                id: "unstake.confirm",
              })}
              {activityStore.getPendingTxnTypes[TXNTYPE.redelegate] && (
                <i className="fas fa-spinner fa-spin ml-2 mr-2" />
              )}
            </ButtonV2>
          </div>
        </FormGroup>
      )}
      <div>
        <Dropdown
          closeClicked={() => setShowValidatorListDropDown(false)}
          title="Select Validator"
          isOpen={showValidatorListDropDown}
          setIsOpen={setShowValidatorListDropDown}
          styleProp={{
            maxHeight: "99vh",
            top: "1vh",
          }}
        >
          <SelectValidatorList
            filteredValidators={validatorsList}
            selectedValidator={selectedValidator}
            setShowValidatorDropdown={setShowValidatorDropdown}
            setShowValidatorListDropDown={setShowValidatorListDropDown}
            setClickedValidator={setClickedValidator}
            sort={sort}
            setIsSortModalOpen={setIsSortModalOpen}
          />
        </Dropdown>

        <Dropdown
          closeClicked={() => {
            setShowValidatorDropdown(false);
            setShowValidatorListDropDown(true);
          }}
          title="Choose Validator"
          isOpen={showValidatorDropdown}
          setIsOpen={setShowValidatorDropdown}
          styleProp={{
            maxHeight: "100%",
            top: 0,
          }}
        >
          <RedelegateValidatorDetail
            onClick={() => {
              setSelectedValidator(clickedValidator);
              setShowValidatorDropdown(false);
            }}
            validatorAddress={clickedValidator.operator_address}
          />
        </Dropdown>

        <Dropdown
          closeClicked={() => {
            setIsSortModalOpen(false);
            setShowValidatorListDropDown(true);
          }}
          title="Sort By"
          isOpen={isSortModalOpen}
          setIsOpen={setIsSortModalOpen}
          styleProp={{
            maxHeight: "600px",
          }}
        >
          <SelectorModal
            close={() => {
              setIsSortModalOpen(false);
              setShowValidatorListDropDown(true);
            }}
            isOpen={isSortModalOpen}
            items={items}
            selectedKey={sort}
            setSelectedKey={(key) => setSort(key as Sort)}
            modalPersistent={false}
          />
        </Dropdown>
      </div>
    </HeaderLayout>
  );
});
