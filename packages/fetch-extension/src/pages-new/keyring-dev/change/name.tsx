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

interface FormData {
  name: string;
}

export const ChangeNamePageV2: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const { index = "-1 " } = useParams<{ index: string }>();

  const intl = useIntl();

  const { keyRingStore } = useStore();

  const waitingNameData = keyRingStore.waitingNameData?.data;

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
    if (waitingNameData?.defaultName) {
      setValue("name", waitingNameData.defaultName);
    }
  }, [waitingNameData, setValue]);

  const [loading, setLoading] = useState(false);
  const [accountNameValidationError, setAccountNameValidationError] =
    useState(false);

  const keyStore = useMemo(() => {
    return keyRingStore.multiKeyStoreInfo[parseInt(index)];
  }, [keyRingStore.multiKeyStoreInfo, index]);

  const isKeyStoreReady = keyRingStore.status === KeyRingStatus.UNLOCKED;

  useEffect(() => {
    if (parseInt(index).toString() !== index) {
      throw new Error("Invalid keyring index, check the url");
    }
  }, [index]);

  const validateWalletName = (value: string) => {
    const alreadyImportedWalletNames = keyRingStore?.multiKeyStoreInfo?.map(
      (item) => item?.meta?.["name"]
    );
    const nameAlreadyExists = alreadyImportedWalletNames?.includes(value);
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

            // Make sure that name is changed
            await keyRingStore.updateNameKeyRing(
              parseInt(index),
              data.name.trim()
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
          value={keyStore?.meta?.["name"] ?? ""}
          readOnly={true}
          style={{ opacity: 0.6 }}
        />
        <Input
          label={intl.formatMessage({
            id: "setting.keyring.change.input.name",
          })}
          type="text"
          formGroupClassName={styleName["formGroup"]}
          floatLabel={true}
          className={styleName["input"]}
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
            setAccountNameValidationError(!validateWalletName(trimmedValue));
          }}
          maxLength={20}
          autoFocus
          readOnly={waitingNameData !== undefined && !waitingNameData?.editable}
        />

        <div style={{ flex: 1 }} />
        <ButtonV2
          variant="dark"
          dataLoading={loading}
          disabled={loading || accountNameValidationError}
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
