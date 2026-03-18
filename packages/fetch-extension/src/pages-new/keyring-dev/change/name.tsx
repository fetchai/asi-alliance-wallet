import React, { FunctionComponent, useState, useEffect, useMemo } from "react";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { useNavigate, useParams } from "react-router";
import { FormattedMessage, useIntl } from "react-intl";
import { Input } from "@components/form";
import { Form } from "reactstrap";
import { useForm } from "react-hook-form";
import { useStore } from "../../../stores";
import { observer } from "mobx-react-lite";
import styleName from "./name.module.scss";
import { ButtonV2 } from "@components-v2/buttons/button";
import classNames from "classnames";
import { validateWalletName } from "@utils/index";
import { useInteractionInfo } from "@hooks/interaction";
import { InteractionWaitingData } from "@keplr-wallet/background";
import { handleExternalInteractionWithNoProceedNext } from "@utils/side-panel";

interface FormData {
  name: string;
}

export const ChangeNamePageV2: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const { index = "-1 " } = useParams<{ index: string }>();

  const intl = useIntl();

  const { keyRingStore, chainStore, interactionStore } = useStore();

  const chainId = chainStore.current.chainId;
  const chainName = chainStore.current.chainName;
  const handleRejectChangeKeyRingName = () =>
    interactionStore.rejectAll("change-keyring-name");

  const interactionData: InteractionWaitingData | undefined =
    interactionStore.getAllData("change-keyring-name")[0];

  const interactionInfo = useInteractionInfo({
    onWindowClose: handleRejectChangeKeyRingName,
    onUnmount: handleRejectChangeKeyRingName,
  });

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: "",
    },
  });

  useEffect(() => {
    if (interactionData?.data) {
      const defaultName = (interactionData.data as any).defaultName;
      if (defaultName) {
        setValue("name", defaultName);
      }
    }
  }, [interactionData?.data, setValue]);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [accountNameValidationError, setAccountNameValidationError] =
    useState(false);
  const [newAccountName, setNewAccountName] = useState("");

  const getNameByChain = (meta?: { [key: string]: string }) => {
    return meta?.["nameByChain"]
      ? JSON.parse(meta["nameByChain"])?.[chainId]
      : undefined;
  };

  const keyStore = useMemo(() => {
    return keyRingStore.selectedKeyInfo;
  }, [keyRingStore.selectedKeyInfo, index]);

  const keyRingMeta = keyStore?.insensitive["keyRingMeta"] as any;
  const isKeyStoreReady = keyRingStore.status === "unlocked";
  const accountName = getNameByChain(keyRingMeta) || keyStore?.name;

  useEffect(() => {
    if (parseInt(index).toString() !== index) {
      throw new Error("Invalid keyring index, check the url");
    }
  }, [index]);

  if (isKeyStoreReady && keyStore == null) {
    return null;
  }

  const notEditable =
    interactionData?.data != null &&
    (interactionData.data as any).editable === false;

  return (
    <HeaderLayout
      showTopMenu={true}
      smallTitle={true}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={intl.formatMessage({
        id: "setting.keyring.change.name",
      })}
      onBackButton={() => {
        navigate(-1);
      }}
      showBottomMenu={false}
    >
      <Form
        className={styleName["container"]}
        onSubmit={handleSubmit(async (data) => {
          setLoading(true);
          try {
            // Close the popup by external change name message
            // Close the popup by external change name messag
            if (index) {
              const trimmedName = data.name.trim();
              if (
                interactionInfo.interaction &&
                !interactionInfo.interactionInternal
              ) {
                await interactionStore.approveWithProceedNextV2(
                  interactionStore
                    .getAllData("change-keyring-name")
                    .map((data) => data.id),
                  trimmedName,
                  (proceedNext) => {
                    if (!proceedNext) {
                      handleExternalInteractionWithNoProceedNext();
                    }
                  }
                );
              } else {
                const nameByChain = keyRingMeta?.nameByChain
                  ? JSON.parse(keyRingMeta?.nameByChain)
                  : {};

                const updatedAccountNames = {
                  ...nameByChain,
                  [chainId]: data.name?.trim(),
                };

                // Make sure that name is changed
                // keep the default name, just update nameByChain
                await keyRingStore.changeKeyRingName(
                  index,
                  keyStore?.name || "",
                  updatedAccountNames
                );

                navigate("/");
              }
            }
          } catch (e) {
            console.log("Fail to decrypt: " + e.message);
            setError("name", {
              message: intl.formatMessage({
                id: "setting.keyring.change.input.name.error.invalid",
              }),
            });
            setLoading(false);
          }
        })}
      >
        {/* <Label for="walletName" className={styleName["label"]}>
          {intl.formatMessage({
            id: "setting.keyring.change.previous-name",
          })}
        </Label> */}
        <Input
          label={intl.formatMessage({
            id: "setting.keyring.change.previous-name",
          })}
          type="text"
          formGroupClassName={styleName["formGroup"]}
          floatLabel={true}
          className={styleName["input"]}
          value={accountName ?? ""}
          readOnly={true}
          style={{ opacity: 0.6 }}
        />
        <Input
          label={intl.formatMessage({
            id: "setting.keyring.change.input.name",
          })}
          type="text"
          formGroupClassName={classNames(styleName["formGroup"], "!mb-0")}
          floatLabel={true}
          className={classNames(styleName["input"], styleName["inputWithInfo"])}
          error={
            accountNameValidationError
              ? errorMessage
              : errors.name && errors.name.message
          }
          {...register("name", {
            required: intl.formatMessage({
              id: "setting.keyring.change.input.name.error.required",
            }),
          })}
          onChange={(e) => {
            setErrorMessage("");
            const trimmedValue = e.target.value.trimStart();
            setValue(e.target.name as keyof FormData, trimmedValue);
            setNewAccountName(trimmedValue);
            const { isValid, isValidFormat, containsLetterOrNumber } =
              validateWalletName(trimmedValue, keyRingStore?.keyInfos);
            const isEmpty = trimmedValue === "";
            if (!isValid || isEmpty) {
              setErrorMessage(
                !isValidFormat
                  ? "Only letters, numbers and basic symbols (_-.@#()) are allowed."
                  : isEmpty
                  ? "Account name cannot be empty"
                  : !containsLetterOrNumber
                  ? "Account name must contain at least one letter or number."
                  : "Account name already exists, please try different name"
              );
            }
            setAccountNameValidationError(!isValid || isEmpty);
          }}
          maxLength={20}
          autoFocus
          append={
            <div
              className={classNames(
                styleName["labelNetworkSelector"],
                newAccountName === accountName ||
                  accountNameValidationError ||
                  (errors.name && errors.name.message)
                  ? "invisible"
                  : "visible"
              )}
            >
              This will update the account name for the selected network (
              {chainName}) only. Other networks will keep their current account
              name.
            </div>
          }
          readOnly={notEditable}
        />

        <div style={{ flex: 1 }} />
        <ButtonV2
          variant="dark"
          dataLoading={loading}
          disabled={
            loading || accountNameValidationError || newAccountName === ""
          }
          text={
            loading ? (
              <i className="fas fa-spinner fa-spin ml-2" />
            ) : (
              <FormattedMessage id="setting.keyring.change.name.button.save" />
            )
          }
          styleProps={{
            height: "56px",
          }}
        />
      </Form>
    </HeaderLayout>
  );
});
