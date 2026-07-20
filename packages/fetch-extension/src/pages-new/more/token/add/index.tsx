import React, { FunctionComponent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useIntl, FormattedMessage } from "react-intl";

import style from "./style.module.scss";
import { ButtonV2 } from "@components-v2/buttons/button";
import { Form } from "reactstrap";
import { Input } from "@components-v2/form";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";
import { useForm } from "react-hook-form";
import { Bech32Address } from "@keplr-wallet/cosmos";
import {
  CW20Currency,
  Erc20Currency,
  Secret20Currency,
} from "@keplr-wallet/types";
import { useInteractionInfo } from "@keplr-wallet/hooks";
import { useLoadingIndicator } from "@components/loading-indicator";
import { useNotification } from "@components/notification";
import { isAddress } from "@ethersproject/address";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { TXNTYPE } from "../../../../config";
import { RequestedChainProvider } from "../../../../utils";
import { KeyRingStatus } from "@keplr-wallet/background";
import {
  assertTokenAddApproveStillValid,
  formatTokenAddPrepareError,
  isContractAlreadyAdded,
  planTokenAddReject,
  planTokenAddSubmit,
  resolveTokenAddBinding,
  shouldInitTokenAddAccount,
  tokenAddSubmitRequiresReadyAccount,
} from "./prepare-token-add-request";

interface FormData {
  contractAddress: string;
  // For the secret20
  viewingKey: string;
}

export const AddTokenPage: FunctionComponent = observer(() => {
  const intl = useIntl();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    chainStore,
    queriesStore,
    accountStore,
    tokensStore,
    analyticsStore,
    keyRingStore,
  } = useStore();

  const waitingSuggested = tokensStore.waitingSuggestedToken;
  // Query binding and write path share one gate (not ?interaction=).
  const binding = resolveTokenAddBinding(
    chainStore.current.chainId,
    chainStore,
    waitingSuggested
  );

  const effectiveChainId =
    binding.mode === "manual" || binding.mode === "suggested"
      ? binding.effectiveChainId
      : chainStore.current.chainId;

  const tokensOf = tokensStore.getTokensOf(effectiveChainId);
  const accountInfo = accountStore.getAccount(effectiveChainId);
  const chainInfo = chainStore.getChain(effectiveChainId);

  const interactionInfo = useInteractionInfo(() => {
    // When creating the secret20 viewing key, this page will be moved to "/sign" page to generate the signature.
    // So, if it is creating phase, don't reject the waiting datas.
    if (accountInfo.txTypeInProgress !== TXNTYPE.createSecret20ViewingKey) {
      tokensStore.rejectAllSuggestedTokens();
    }
  });

  const form = useForm<FormData>({
    defaultValues: {
      contractAddress: "",
      viewingKey: "",
    },
  });

  const contractAddress = form.watch("contractAddress");

  const suggestedContractAddress =
    binding.mode === "suggested" ? binding.contractAddress : undefined;

  useEffect(() => {
    if (suggestedContractAddress == null) {
      return;
    }
    if (contractAddress !== suggestedContractAddress) {
      form.setValue("contractAddress", suggestedContractAddress);
    }
  }, [suggestedContractAddress, contractAddress, form]);

  // Request chain ≠ current is not covered by root autorun (autoInit: false).
  useEffect(() => {
    if (keyRingStore.status !== KeyRingStatus.UNLOCKED) {
      return;
    }
    if (shouldInitTokenAddAccount(accountInfo.walletStatus)) {
      accountInfo.init();
    }
  }, [accountInfo, effectiveChainId, keyRingStore.status]);

  const isSecret20 =
    (chainInfo.features ?? []).find((feature) => feature === "secretwasm") !=
    null;

  const queries = queriesStore.get(effectiveChainId);

  const isEvm = chainInfo.features?.includes("evm") ?? false;
  const query = isEvm
    ? queries.evm.queryErc20Metadata
    : isSecret20
    ? queries.secret.querySecret20ContractInfo
    : queries.cosmwasm.querycw20ContractInfo;
  const queryContractInfo = query.getQueryContract(contractAddress);

  const tokenInfo = queryContractInfo?.tokenInfo;
  const [isOpenSecret20ViewingKey, setIsOpenSecret20ViewingKey] =
    useState(false);

  const notification = useNotification();
  const loadingIndicator = useLoadingIndicator();

  const createViewingKey = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      accountInfo.secret
        .createSecret20ViewingKey(
          contractAddress,
          "",
          {},
          {},
          (_, viewingKey) => {
            loadingIndicator.setIsLoading("create-veiwing-key", false);

            resolve(viewingKey);
          }
        )
        .then(() => {
          loadingIndicator.setIsLoading("create-veiwing-key", true);
        })
        .catch(reject);
    });
  };

  const currencyAlreadyAdded = isContractAlreadyAdded(
    chainInfo.currencies,
    contractAddress
  )
    ? "Currency already added"
    : undefined;

  const queryError =
    contractAddress.length &&
    (form.formState.errors.contractAddress
      ? form.formState.errors.contractAddress.message
      : tokenInfo == null
      ? (queryContractInfo?.error?.data as any)?.error ||
        queryContractInfo?.error?.message
      : undefined)
      ? "Invalid address"
      : undefined;

  const isError = currencyAlreadyAdded || queryError;

  const closeOrNavigateHome = () => {
    if (interactionInfo.interaction && !interactionInfo.interactionInternal) {
      window.close();
    } else {
      if (location.hash === "#agent") navigate(-1);
      navigate("/");
    }
  };

  const approveSuggestedOrAdd = async (
    currency: CW20Currency | Erc20Currency | Secret20Currency,
    options?: { trackSave?: boolean }
  ) => {
    if (binding.mode !== "manual" && binding.mode !== "suggested") {
      throw new Error("Suggested token chain could not be resolved");
    }
    const action = planTokenAddSubmit(binding);
    if (action.type === "approveSuggested") {
      const waitingNow = tokensStore.waitingSuggestedToken;
      assertTokenAddApproveStillValid(
        waitingNow,
        action.interactionId,
        action.chainId
      );
      await tokensStore.approveSuggestedToken(currency, {
        interactionId: action.interactionId,
        chainId: action.chainId,
      });
      return;
    }

    await tokensOf.addToken(currency);
    if (options?.trackSave) {
      analyticsStore.logEvent("save_click", {
        pageName: "Add a Token",
      });
    }
  };

  if (binding.mode === "suggested_unresolved") {
    return (
      <HeaderLayout
        smallTitle={true}
        showTopMenu={true}
        showChainName={false}
        canChangeChainInfo={false}
        alternativeTitle={intl.formatMessage({
          id: "setting.token.add",
        })}
        showBottomMenu={false}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: "16px",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div style={{ color: "#e74c3c", maxWidth: "320px" }}>
            {formatTokenAddPrepareError(binding.error)}
          </div>
          <ButtonV2
            variant="dark"
            text="Reject"
            styleProps={{ height: "48px", width: "200px" }}
            onClick={async () => {
              const reject = planTokenAddReject(binding);
              if (reject) {
                await tokensStore.rejectSuggestedToken({
                  interactionId: reject.interactionId,
                });
              }
              closeOrNavigateHome();
            }}
          />
        </div>
      </HeaderLayout>
    );
  }

  const formContent = (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={intl.formatMessage({
        id: "setting.token.add",
      })}
      onBackButton={
        interactionInfo.interaction
          ? undefined
          : () => {
              analyticsStore.logEvent("back_click", {
                pageName: "Add a Token",
              });
              navigate(-1);
            }
      }
      showBottomMenu={false}
    >
      <Form
        className={style["container"]}
        onSubmit={form.handleSubmit(async (data) => {
          if (
            tokenInfo?.decimals != null &&
            tokenInfo.name &&
            tokenInfo.symbol
          ) {
            if (!isSecret20) {
              const currency: CW20Currency | Erc20Currency = {
                type: isEvm ? "erc20" : "cw20",
                contractAddress: data.contractAddress,
                coinMinimalDenom: tokenInfo.name,
                coinDenom: tokenInfo.symbol,
                coinDecimals: tokenInfo.decimals,
              };

              await approveSuggestedOrAdd(currency, { trackSave: true });
            } else {
              let viewingKey = data.viewingKey;
              if (!viewingKey && !isOpenSecret20ViewingKey) {
                try {
                  viewingKey = await createViewingKey();
                } catch (e) {
                  notification.push({
                    placement: "top-center",
                    type: "danger",
                    duration: 2,
                    content: `Failed to create the viewing key: ${e.message}`,
                    canDelete: true,
                    transition: {
                      duration: 0.25,
                    },
                  });

                  const reject = planTokenAddReject(binding);
                  if (reject) {
                    await tokensStore.rejectSuggestedToken({
                      interactionId: reject.interactionId,
                    });
                  }

                  closeOrNavigateHome();
                  return;
                }
              }

              if (!viewingKey) {
                notification.push({
                  placement: "top-center",
                  type: "danger",
                  duration: 2,
                  content: "Failed to create the viewing key",
                  canDelete: true,
                  transition: {
                    duration: 0.25,
                  },
                });
              } else {
                const currency: Secret20Currency = {
                  type: "secret20",
                  contractAddress: data.contractAddress,
                  viewingKey,
                  coinMinimalDenom: tokenInfo.name,
                  coinDenom: tokenInfo.symbol,
                  coinDecimals: tokenInfo.decimals,
                };

                await approveSuggestedOrAdd(currency);
              }
            }

            closeOrNavigateHome();
          }
        })}
      >
        <div className={style["label"]}>
          {intl.formatMessage({
            id: "setting.token.add.contract-address",
          })}
        </div>
        <Input
          className={style["input"]}
          formGroupClassName={style["formGroup"]}
          type="text"
          autoComplete="off"
          readOnly={waitingSuggested != null}
          {...form.register("contractAddress", {
            required: "Contract address is required",
            validate: (value: string): string | undefined => {
              try {
                if (isEvm) {
                  return isAddress(value) ? undefined : "Invalid Address";
                }

                Bech32Address.validate(
                  value,
                  chainInfo.bech32Config.bech32PrefixAccAddr
                );
              } catch {
                return "Invalid address";
              }
            },
          })}
          error={isError}
          text={
            queryContractInfo?.isFetching && contractAddress.length ? (
              <i className="fas fa-spinner fa-spin" />
            ) : undefined
          }
        />
        <div className={style["label"]}>
          {intl.formatMessage({
            id: "setting.token.add.name",
          })}
        </div>
        <Input
          style={{ height: "43px" }}
          className={style["input"]}
          type="text"
          value={tokenInfo?.name ?? "-"}
          readOnly={true}
        />
        <div className={style["label"]}>
          {intl.formatMessage({
            id: "setting.token.add.symbol",
          })}
        </div>
        <Input
          style={{ height: "43px" }}
          className={style["input"]}
          type="text"
          value={tokenInfo?.symbol ?? "-"}
          readOnly={true}
        />
        <div className={style["label"]}>
          {intl.formatMessage({
            id: "setting.token.add.decimals",
          })}
        </div>
        <Input
          style={{ height: "43px" }}
          className={style["input"]}
          type="text"
          value={tokenInfo?.decimals ?? "-"}
          readOnly={true}
        />
        {isSecret20 && isOpenSecret20ViewingKey ? (
          <React.Fragment>
            <div className={style["label"]}>
              {intl.formatMessage({
                id: "setting.token.add.secret20.viewing-key",
              })}
            </div>{" "}
            <Input
              style={{ height: "43px" }}
              className={style["input"]}
              type="text"
              autoComplete="off"
              {...form.register("viewingKey", {
                required: "Viewing key is required",
              })}
              error={
                form.formState.errors.viewingKey
                  ? form.formState.errors.viewingKey.message
                  : undefined
              }
            />
          </React.Fragment>
        ) : null}
        <div style={{ flex: 1 }} />
        {isSecret20 ? (
          <div className="custom-control custom-checkbox mb-2">
            <input
              className={`${"custom-control-input"} ${style["checkbox"]}`}
              id="viewing-key-checkbox"
              type="checkbox"
              checked={isOpenSecret20ViewingKey}
              onChange={() => {
                setIsOpenSecret20ViewingKey((value) => !value);
              }}
            />
            <label
              className={`${"custom-control-label"} ${style["checkboxLabel"]}`}
              htmlFor="viewing-key-checkbox"
              style={{ color: "#666666", paddingTop: "1px" }}
            >
              <FormattedMessage id="setting.token.add.secret20.checkbox.import-viewing-key" />
            </label>
          </div>
        ) : null}
        <ButtonV2
          variant="dark"
          text=""
          disabled={
            isError !== undefined ||
            tokenInfo == null ||
            (tokenAddSubmitRequiresReadyAccount({
              isSecret20,
              isImportingViewingKey: isOpenSecret20ViewingKey,
            }) &&
              !accountInfo.isReadyToSendTx)
          }
          dataLoading={
            accountInfo.txTypeInProgress === TXNTYPE.createSecret20ViewingKey
          }
          styleProps={{
            height: "56px",
          }}
        >
          <FormattedMessage id="setting.token.add.button.submit" />
        </ButtonV2>
      </Form>
    </HeaderLayout>
  );

  if (binding.mode === "suggested") {
    return (
      <RequestedChainProvider value={binding.requested}>
        {formContent}
      </RequestedChainProvider>
    );
  }

  return formContent;
});
