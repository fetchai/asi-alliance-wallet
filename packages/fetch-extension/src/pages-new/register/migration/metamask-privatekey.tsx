import React, { FunctionComponent, useState, useEffect } from "react";
import { BackButton } from "../index";
import { FormattedMessage, useIntl } from "react-intl";
import { Input, TextArea } from "@components/form";
import style from "../style.module.scss";
import { Form } from "reactstrap";
import { useForm } from "react-hook-form";
import { Buffer } from "buffer";
import { parseEthPrivateKey } from "@fetchai/eth-migration";
import { RegisterConfig } from "@keplr-wallet/hooks";
import { ButtonV2 } from "@components-v2/buttons/button";
import { PasswordInput } from "@components-v2/form";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { SelectNetwork } from "../select-network";
import classNames from "classnames";
import { getNextDefaultAccountName, validateAccountName } from "@utils/index";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { RefreshAccountList } from "@keplr-wallet/background";
import { PasswordStrengthMeter } from "@components-v2/password-strength/password-strength-meter";
import { Checkbox } from "@components-v2/checkbox/checkbox";

interface FormData {
  name: string;
  ethAddress: string;
  ethPrivateKey: string;
  password: string;
  confirmPassword: string;
}

function isPrivateKey(str: string): boolean {
  if (str.startsWith("0x")) {
    return true;
  }

  return str.length === 64;
}

export const MigrateMetamaskPrivateKeyPage: FunctionComponent<{
  registerConfig: RegisterConfig;
  onBack: () => void;
}> = observer(({ registerConfig, onBack }) => {
  const intl = useIntl();
  const { keyRingStore } = useStore();

  const [selectedNetworks, setSelectedNetworks] = useState<string[]>([]);
  const [passwordCheckbox, setPasswordCheckbox] = useState(false);
  const [passwordStrengthScore, setPasswordStrengthScore] = useState(0);
  const accountList = keyRingStore.multiKeyStoreInfo;
  const defaultAccountName = getNextDefaultAccountName(accountList);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    trigger,
    watch,
  } = useForm<FormData>({
    defaultValues: {
      name: defaultAccountName,
      ethAddress: "",
      ethPrivateKey: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const { name, password, ethAddress, confirmPassword, ethPrivateKey } =
    watch();

  useEffect(() => {
    if (confirmPassword) {
      trigger("confirmPassword");
    }
  }, [password, trigger]);

  const areInputsEmpty =
    name === "" ||
    ethPrivateKey === "" ||
    ethAddress === "" ||
    (registerConfig.mode === "create" &&
      (password === "" || confirmPassword === ""));

  return (
    <div className={style["migrateContainer"]}>
      <BackButton onClick={onBack} />
      <h1>
        <FormattedMessage id="register.eth-migrate.metamask-private-key.title" />
      </h1>
      <Form
        className={style["formContainer"]}
        onSubmit={handleSubmit(async (data: FormData) => {
          // extract the private key
          const privateKey = Buffer.from(
            data.ethPrivateKey.trim().replace("0x", ""),
            "hex"
          ) as Uint8Array;

          // attempt to parse the private key information
          const parsedKey = parseEthPrivateKey(privateKey);
          if (parsedKey === undefined) {
            alert("Unable to parse private key");
            return;
          }

          // check that the parsed private key matches
          if (parsedKey.ethAddress !== data.ethAddress) {
            alert("This private key does not match the address provided");
            return;
          }

          // trigger the on complete handler
          await registerConfig.createPrivateKey(
            data.name,
            privateKey,
            data.password,
            {},
            selectedNetworks
          );
          await keyRingStore.changeKeyRing(
            keyRingStore.multiKeyStoreInfo.length - 1
          );
          await new InExtensionMessageRequester().sendMessage(
            BACKGROUND_PORT,
            new RefreshAccountList()
          );
        })}
      >
        <Input
          formGroupClassName="mb-0"
          className={style["input"]}
          label={intl.formatMessage({
            id: "register.name",
          })}
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
            "mb-1 text-xs",
            name === defaultAccountName || (errors.name && errors.name.message)
              ? "invisible"
              : "visible"
          )}
        >
          * (Account name for unselected networks will be {defaultAccountName})
        </div>
        <SelectNetwork
          className="mb-3"
          selectedNetworks={selectedNetworks}
          disabled={name === defaultAccountName}
          onMultiSelectChange={(values) => {
            setSelectedNetworks(values);
          }}
        />
        <Input
          className={style["input"]}
          label={intl.formatMessage({
            id: "register.eth-migrate.eth-address",
          })}
          type="text"
          {...register("ethAddress", {
            required: intl.formatMessage({
              id: "register.eth-migrate.eth-address.error.required",
            }),
          })}
          error={errors.ethAddress && errors.ethAddress.message}
        />
        <TextArea
          label="Private Key"
          className={style["mnemonic"]}
          placeholder="Enter your private key"
          rows={3}
          {...register("ethPrivateKey", {
            required: "Private key is required",
            validate: (value: string): string | undefined => {
              if (!isPrivateKey(value)) {
                return intl.formatMessage({
                  id: "register.eth-migrate.eth-private-key.error.invalid",
                });
              } else {
                value = value.replace("0x", "");
                if (value.length !== 64) {
                  return intl.formatMessage({
                    id: "register.import.textarea.private-key.error.invalid-length",
                  });
                }

                const privateKeyData = Buffer.from(value, "hex");
                try {
                  if (
                    privateKeyData.toString("hex").toLowerCase() !==
                    value.toLowerCase()
                  ) {
                    return intl.formatMessage({
                      id: "register.import.textarea.private-key.error.invalid",
                    });
                  }
                } catch {
                  return intl.formatMessage({
                    id: "register.import.textarea.private-key.error.invalid",
                  });
                }

                // parse the private key
                const parsedKey = parseEthPrivateKey(
                  privateKeyData as Uint8Array
                );
                if (parsedKey === undefined) {
                  return "Invalid ETH private key";
                }

                // check that the parsed private key matches
                if (parsedKey.ethAddress !== ethAddress) {
                  return "The key provided doesn't match the supplied ETH addres";
                }
              }
            },
          })}
          error={errors.ethPrivateKey && errors.ethPrivateKey.message}
        />
        {registerConfig.mode === "create" && (
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
              labelStyle={{
                marginTop: "0px",
              }}
              error={errors.confirmPassword && errors.confirmPassword.message}
            />
            <div className="pt-2 space-y-1 text-sm">
              <PasswordStrengthMeter
                password={password}
                onStrengthChange={(score) => setPasswordStrengthScore(score)}
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
        )}
        <ButtonV2
          variant="dark"
          styleProps={{ marginBottom: "20px" }}
          text={
            registerConfig.isLoading ? (
              <i className="fas fa-spinner fa-spin ml-2" />
            ) : (
              <FormattedMessage id="register.create.button.next" />
            )
          }
          disabled={
            registerConfig.isLoading ||
            (registerConfig.mode === "create" &&
              (Boolean(
                errors?.confirmPassword?.message || errors?.password?.message
              ) ||
                (password !== "" &&
                  passwordStrengthScore < 3 &&
                  !passwordCheckbox))) ||
            areInputsEmpty ||
            Boolean(errors?.name?.message) ||
            (selectedNetworks.length === 0 && name !== defaultAccountName)
          }
        />
      </Form>
    </div>
  );
});
