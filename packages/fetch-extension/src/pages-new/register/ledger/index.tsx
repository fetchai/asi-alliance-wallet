import React, { FunctionComponent, useState } from "react";
import { RegisterConfig } from "@keplr-wallet/hooks";
import { FormattedMessage, useIntl } from "react-intl";
import { Form, Label } from "reactstrap";
import { useForm } from "react-hook-form";
import style from "../style.module.scss";
import { Input, PasswordInput } from "@components-v2/form";
import { AdvancedBIP44Option, useBIP44Option } from "../advanced-bip44";
import { BackButton } from "../index";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { ledgerUSBVendorId } from "@ledgerhq/devices";
import { ButtonV2 } from "@components-v2/buttons/button";
import { LedgerSetupView } from "../../../pages/ledger";
import { useNotification } from "@components/notification";

export const TypeImportLedger = "import-ledger";

interface FormData {
  name: string;
  password: string;
  confirmPassword: string;
}

export const ImportLedgerIntro: FunctionComponent<{
  registerConfig: RegisterConfig;
}> = observer(({ registerConfig }) => {
  const { analyticsStore } = useStore();
  return (
    <ButtonV2
      onClick={(e: any) => {
        e.preventDefault();

        registerConfig.setType(TypeImportLedger);
        analyticsStore.logEvent("Import account started", {
          registerType: "ledger",
        });
      }}
      text={<FormattedMessage id="register.ledger.title" />}
    />
  );
});

export const ImportLedgerPage: FunctionComponent<{
  registerConfig: RegisterConfig;
  setSelectedCard: any;
}> = observer(({ registerConfig, setSelectedCard }) => {
  const intl = useIntl();
  const notification = useNotification();
  const bip44Option = useBIP44Option(118);
  const [isShowLedgerSetup, setShowLedgerSetup] = useState<boolean>(false);
  const { analyticsStore, ledgerInitStore } = useStore();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: "",
      password: "",
      confirmPassword: "",
    },
  });

  const ensureUSBPermission = async () => {
    const anyNavigator = navigator as any;
    let protocol: any;
    if (ledgerInitStore.isWebHID) {
      protocol = anyNavigator.hid;
    } else {
      protocol = anyNavigator.usb;
    }

    const devices = await protocol.requestDevice({
      filters: [
        {
          vendorId: ledgerUSBVendorId,
        },
      ],
    });

    if (!devices || (Array.isArray(devices) && devices.length === 0)) {
      throw new Error("No device selected");
    }
  };

  async function createLedger(
    name: string,
    password: string,
    isShowUSBPermission?: boolean
  ) {
    try {
      if (isShowUSBPermission) {
        await ensureUSBPermission();
      }
    } catch (e) {
      notification.push({
        type: "warning",
        placement: "top-center",
        duration: 5,
        content: "Please select a device to continue.",
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });
      return;
    }

    try {
      await registerConfig.createLedger(
        name,
        password,
        bip44Option.bip44HDPath,
        "Cosmos"
      );
      analyticsStore.setUserProperties({
        registerType: "ledger",
        accountType: "ledger",
      });
      setShowLedgerSetup(false);
    } catch (e) {
      setShowLedgerSetup(true);
    }
  }

  return isShowLedgerSetup ? (
    <LedgerSetupView
      onBackPress={() => setShowLedgerSetup(false)}
      onInitSucceed={async () =>
        createLedger(getValues()["name"], getValues()["password"])
      }
    />
  ) : (
    <div
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "start",
        height: "95%",
      }}
    >
      <div className={style["ledgerContainer"]}>
        <BackButton
          onClick={() => {
            setSelectedCard("main");
          }}
        />
        <div
          style={{ marginTop: "24px", marginBottom: "12px" }}
          className={style["pageTitle"]}
        >
          Connect hardware wallet
        </div>
        <div
          style={{ marginBottom: "24px" }}
          className={style["newMnemonicText"]}
        >
          To keep your account safe, avoid any personal information or words
        </div>
        <div style={{ display: "flex" }}>
          <Form
            className={style["formContainer"]}
            onSubmit={handleSubmit(async (data: FormData) => {
              await createLedger(data.name, data.password, true);
            })}
          >
            <Label
              for="name"
              style={{
                color: "rgba(255,255,255,0.6)",
                fontWeight: 400,
                fontSize: "14px",
                marginBottom: "8px",
              }}
            >
              {intl.formatMessage({ id: "register.name" })}
            </Label>
            <Input
              className={style["addressInput"]}
              type="text"
              {...register("name", {
                required: intl.formatMessage({
                  id: "register.name.error.required",
                }),
              })}
              error={errors.name && errors.name.message}
              maxLength={20}
              style={{
                marginTop: "0px",
                marginBottom: "16px",
              }}
            />
            {registerConfig.mode === "create" ? (
              <React.Fragment>
                <PasswordInput
                  {...register("password", {
                    required: intl.formatMessage({
                      id: "register.create.input.password.error.required",
                    }),
                    validate: (password: string): string | undefined => {
                      if (password.length < 8) {
                        return intl.formatMessage({
                          id: "register.create.input.password.error.too-short",
                        });
                      }
                    },
                  })}
                  error={errors.password && errors.password.message}
                  labelStyle={{
                    marginTop: "0px",
                  }}
                  inputStyle={{
                    marginBottom: "16px",
                  }}
                />
                <PasswordInput
                  {...register("confirmPassword", {
                    required: intl.formatMessage({
                      id: "register.create.input.confirm-password.error.required",
                    }),
                    validate: (confirmPassword: string): string | undefined => {
                      if (confirmPassword !== getValues()["password"]) {
                        return intl.formatMessage({
                          id: "register.create.input.confirm-password.error.unmatched",
                        });
                      }
                    },
                  })}
                  error={
                    errors.confirmPassword && errors.confirmPassword.message
                  }
                  labelStyle={{
                    marginTop: "0px",
                  }}
                  inputStyle={{
                    marginBottom: "24px",
                  }}
                />
              </React.Fragment>
            ) : null}
            <div style={{ width: "339px", marginTop: "0px" }}>
              <AdvancedBIP44Option bip44Option={bip44Option} />
            </div>
            <ButtonV2
              data-loading={registerConfig.isLoading}
              text={
                registerConfig.isLoading ? (
                  <i className="fas fa-spinner fa-spin ml-2" />
                ) : (
                  <FormattedMessage id="register.create.button.next" />
                )
              }
              onClick={() => {
                analyticsStore.logEvent("register_next_click", {
                  registerType: "ledger",
                  accountType: "ledger",
                  pageName: "Register",
                });
              }}
              disabled={registerConfig.isLoading}
              styleProps={{
                height: "56px",
                position: "absolute",
                bottom: "5px",
              }}
            />

            {/* Tera Ledger disabled */}
            {/* <Button
              type="button"
              color="link"
              onClick={handleSubmit(async (data: FormData) => {
                if (registerConfig.isLoading) {
                  return;
                }

                try {
                  await ensureUSBPermission();

                  await registerConfig.createLedger(
                    data.name,
                    data.password,
                    bip44Option.bip44HDPath,
                    "Terra"
                  );
                  analyticsStore.setUserProperties({
                    registerType: "ledger",
                    accountType: "ledger",
                  });
                } catch (e) {
                  alert(e.message ? e.message : e.toString());
                  registerConfig.clear();
                }
              })}
            >
              <FormattedMessage id="register.create.button.ledger.terra" />
            </Button> */}
          </Form>
        </div>
      </div>
    </div>
  );
});
