import React, { FunctionComponent, useState, useEffect } from "react";
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
import { SelectNetwork } from "../select-network";
import classNames from "classnames";
import { getNextDefaultAccountName, validateAccountName } from "@utils/index";
import { PasswordStrengthMeter } from "../../../components-v2/password-strength/password-strength-meter";
import { Checkbox } from "@components-v2/checkbox/checkbox";

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
  const { analyticsStore, keyRingStore, ledgerInitStore } = useStore();

  const [selectedNetworks, setSelectedNetworks] = useState<string[]>([]);
  const [passwordCheckbox, setPasswordCheckbox] = useState(false);
  const [passwordStrengthScore, setPasswordStrengthScore] = useState(0);
  const accountList = keyRingStore.multiKeyStoreInfo;
  const defaultAccountName = getNextDefaultAccountName(accountList);

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: defaultAccountName,
      password: "",
      confirmPassword: "",
    },
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const { confirmPassword, name, password } = watch();

  useEffect(() => {
    if (confirmPassword) {
      trigger("confirmPassword");
    }
  }, [password, trigger]);

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
        "Cosmos",
        selectedNetworks
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

  const areInputsEmpty =
    name === "" ||
    (registerConfig.mode === "create" &&
      (password === "" || confirmPassword === ""));

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
        <div style={{ display: "flex", width: "100%" }}>
          <Form
            className={style["formContainer"]}
            onSubmit={handleSubmit(async (data: FormData) => {
              await createLedger(data.name, data.password, true);
            })}
          >
            <Label for="name" className={classNames(style["label"], "mb-2")}>
              {intl.formatMessage({ id: "register.name" })}
            </Label>
            <Input
              formGroupClassName={style["ledgerFormGroup"]}
              className={classNames(style["addressInput"], "mt-0")}
              type="text"
              {...register("name", {
                required: intl.formatMessage({
                  id: "register.name.error.required",
                }),
                validate: (value: string) =>
                  validateAccountName(
                    value,
                    keyRingStore?.multiKeyStoreInfo,
                    registerConfig.mode
                  ),
              })}
              error={errors.name && errors.name.message}
              onChange={(e: any) => {
                const trimmedValue = e.target.value.trimStart();
                setValue(e.target.name, trimmedValue, { shouldValidate: true });
              }}
              maxLength={20}
            />
            <div
              className={classNames(
                style["label"],
                "mb-2 text-xs",
                name === defaultAccountName ||
                  (errors.name && errors.name.message)
                  ? "invisible"
                  : "visible"
              )}
            >
              * (Account name for unselected networks will be{" "}
              {defaultAccountName})
            </div>
            <SelectNetwork
              className="mb-4"
              selectedNetworks={selectedNetworks}
              disabled={name === defaultAccountName}
              onMultiSelectChange={(values) => {
                setSelectedNetworks(values);
              }}
            />
            {registerConfig.mode === "create" ? (
              <React.Fragment>
                <PasswordInput
                  {...register("password", {
                    required: intl.formatMessage({
                      id: "register.create.input.password.error.required",
                    }),
                    setValueAs: (value: string) => value.trim(),
                    validate: (password: string): string | undefined => {
                      if (password.length < 8) {
                        return intl.formatMessage({
                          id: "register.create.input.password.error.too-short",
                        });
                      }
                    },
                  })}
                  placeholder="Enter Password (min 8 characters)"
                  error={errors.password && errors.password.message}
                  labelStyle={{
                    marginTop: "0px",
                  }}
                  inputStyle={{
                    marginBottom: "5px",
                  }}
                />
                <PasswordInput
                  passwordLabel="Confirm Password"
                  {...register("confirmPassword", {
                    required: intl.formatMessage({
                      id: "register.create.input.confirm-password.error.required",
                    }),
                    setValueAs: (value: string) => value.trim(),
                    validate: (confirmPassword: string): string | undefined => {
                      if (confirmPassword !== password) {
                        return intl.formatMessage({
                          id: "register.create.input.confirm-password.error.unmatched",
                        });
                      }
                    },
                  })}
                  placeholder="Confirm Password"
                  error={
                    errors.confirmPassword && errors.confirmPassword.message
                  }
                  labelStyle={{
                    marginTop: "0px",
                  }}
                  inputStyle={{
                    marginBottom: "5px",
                  }}
                />
                <div className="pt-2 space-y-1 text-sm">
                  <PasswordStrengthMeter
                    password={password}
                    onStrengthChange={(score) =>
                      setPasswordStrengthScore(score)
                    }
                  />
                </div>
                {passwordStrengthScore < 3 && password.length >= 8 && (
                  <Checkbox
                    isChecked={passwordCheckbox}
                    className="py-2"
                    setIsChecked={setPasswordCheckbox}
                    label="I understand this password is not strong and still want to continue."
                  />
                )}
              </React.Fragment>
            ) : null}
            <div className="w-full mt-0">
              <AdvancedBIP44Option bip44Option={bip44Option} />
            </div>
            <ButtonV2
              variant="dark"
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
              disabled={
                registerConfig.isLoading ||
                (registerConfig.mode === "create" &&
                  (Boolean(
                    errors?.confirmPassword?.message ||
                      errors?.password?.message
                  ) ||
                    (password !== "" &&
                      passwordStrengthScore < 3 &&
                      !passwordCheckbox))) ||
                areInputsEmpty ||
                Boolean(errors?.name?.message) ||
                (selectedNetworks.length === 0 && name !== defaultAccountName)
              }
              styleProps={{
                height: "56px",
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
