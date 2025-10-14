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
import { KeyRingStatus } from "@keplr-wallet/background";
import { ButtonV2 } from "@components-v2/buttons/button";
import classNames from "classnames";

interface FormData {
  name: string;
}

export const ChangeNamePageV2: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const { index = "-1 " } = useParams<{ index: string }>();

  const intl = useIntl();

  const { keyRingStore, chainStore } = useStore();

  const chainId = chainStore.current.chainId;
  const chainName = chainStore.current.chainName;
  const waitingNameData = keyRingStore.waitingNameData?.data;
  const keyStore = useMemo(() => {
    return keyRingStore.multiKeyStoreInfo[parseInt(index)];
  }, [keyRingStore.multiKeyStoreInfo, index]);

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

  // Default value equals current name
  useEffect(() => {
    if (keyStore?.meta?.["name"]) {
      setValue("name", keyStore.meta["name"]);
    }
  }, [keyStore, setValue]);

  const [loading, setLoading] = useState(false);
  const [accountNameValidationError, setAccountNameValidationError] =
    useState(false);
  const [newAccountName, setNewAccountName] = useState("");

  const getNameByChain = (meta?: { [key: string]: string }) => {
    return meta?.["nameByChain"]
      ? JSON.parse(meta["nameByChain"])?.[chainId]
      : undefined;
  };

  const isKeyStoreReady = keyRingStore.status === KeyRingStatus.UNLOCKED;
  const accountName = getNameByChain(keyStore?.meta) || keyStore.meta?.["name"];

  useEffect(() => {
    if (parseInt(index).toString() !== index) {
      throw new Error("Invalid keyring index, check the url");
    }
  }, [index]);

  const validateWalletName = (value: string) => {
    const alreadyImportedWalletNames = [
      ...new Set(
        keyRingStore?.multiKeyStoreInfo?.flatMap((item) => {
          const defaultName = item?.meta?.["name"];
          const chainNames = item?.meta?.["nameByChain"]
            ? Object.values(JSON.parse(item?.meta?.["nameByChain"]))
            : [];
          return [defaultName, ...chainNames].filter(Boolean);
        }) ?? []
      ),
    ];

    const nameAlreadyExists = alreadyImportedWalletNames.includes(value);
    return !nameAlreadyExists;
  };

  if (isKeyStoreReady && keyStore == null) {
    return null;
  }

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
            if (waitingNameData != null) {
              await keyRingStore.approveChangeName(data.name);
              window.close();
              return;
            }

            const nameByChain = keyStore.meta?.["nameByChain"]
              ? JSON.parse(keyStore.meta?.["nameByChain"])
              : {};

            const updatedAccountNames = {
              ...nameByChain,
              [chainId]: data.name?.trim(),
            };

            // Make sure that name is changed
            // keep the default name, just update nameByChain
            await keyRingStore.updateNameKeyRing(
              parseInt(index),
              keyStore.meta?.["name"] || "",
              updatedAccountNames
            );

            navigate("/");
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
              ? "Account name already exists, please try different name"
              : errors.name && errors.name.message
          }
          {...register("name", {
            required: intl.formatMessage({
              id: "setting.keyring.change.input.name.error.required",
            }),
          })}
          onChange={(e) => {
            const trimmedValue = e.target.value.trimStart();
            setValue(e.target.name as keyof FormData, trimmedValue);
            setNewAccountName(trimmedValue);
            setAccountNameValidationError(!validateWalletName(trimmedValue));
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
          readOnly={waitingNameData !== undefined && !waitingNameData?.editable}
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
