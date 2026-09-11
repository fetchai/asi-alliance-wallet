import React, { FunctionComponent, useState, useEffect, useMemo } from "react";
import { HeaderLayout } from "@layouts-v2/header-layout";

import { useNavigate, useParams } from "react-router";
import { FormattedMessage, useIntl } from "react-intl";
import { Input } from "@components/form";
import { Button, Form } from "reactstrap";
import { useForm } from "react-hook-form";
import { useStore } from "../../../../stores";
import { observer } from "mobx-react-lite";
import { InteractionWaitingData } from "@keplr-wallet/background";

import styleName from "./name.module.scss";
import { handleExternalInteractionWithNoProceedNext } from "@utils/side-panel";
import { useInteractionInfo } from "@hooks/interaction";

interface FormData {
  name: string;
}

export const ChangeNamePage: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const { index = "-1 " } = useParams<{ index: string }>();

  const intl = useIntl();

  const { keyRingStore, analyticsStore, interactionStore } = useStore();

  const interactionData: InteractionWaitingData | undefined =
    interactionStore.getAllData("change-keyring-name")[0];

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

  const handleRejectChangeKeyRingName = () =>
    interactionStore.rejectAll("change-keyring-name");

  const interactionInfo = useInteractionInfo({
    onWindowClose: handleRejectChangeKeyRingName,
    onUnmount: handleRejectChangeKeyRingName,
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

  const keyStore = useMemo(() => {
    return keyRingStore.keyInfos[parseInt(index)];
  }, [keyRingStore.keyInfos, index]);

  const isKeyStoreReady = keyRingStore.status === "unlocked";

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
        analyticsStore.logEvent("back_click", {
          pageName: "Change Account Name",
        });
        navigate(-1);
      }}
    >
      <Form
        className={styleName["container"]}
        onSubmit={handleSubmit(async (data) => {
          setLoading(true);
          try {
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
                // Make sure that name is changed
                await keyRingStore.changeKeyRingName(index, data.name.trim());
                analyticsStore.logEvent("save_account_name_click");
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
        <Input
          type="text"
          label={intl.formatMessage({
            id: "setting.keyring.change.previous-name",
          })}
          value={keyStore?.name ?? ""}
          readOnly={true}
        />
        <Input
          type="text"
          label={intl.formatMessage({
            id: "setting.keyring.change.input.name",
          })}
          error={errors.name && errors.name.message}
          {...register("name", {
            required: intl.formatMessage({
              id: "setting.keyring.change.input.name.error.required",
            }),
          })}
          maxLength={20}
          readOnly={notEditable}
        />

        <div style={{ flex: 1 }} />
        <Button type="submit" color="primary" block data-loading={loading}>
          <FormattedMessage id="setting.keyring.change.name.button.save" />
        </Button>
      </Form>
    </HeaderLayout>
  );
});
