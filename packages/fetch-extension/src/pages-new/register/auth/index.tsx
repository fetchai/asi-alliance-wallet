import { Input, PasswordInput } from "@components-v2/form";
import { RegisterConfig } from "@keplr-wallet/hooks";
import {
  AUTH_CONNECTION,
  CHAIN_NAMESPACES,
  MFA_LEVELS,
  WALLET_CONNECTORS,
  WEB3AUTH_NETWORK,
  Web3Auth,
} from "@web3auth/modal";

// Cosmos/Fetch is not on the Embedded Wallets predefined list — pass it via
// `chains` so init() does not require a dashboard chain config.
const fetchChainConfig = {
  chainNamespace: CHAIN_NAMESPACES.OTHER,
  chainId: "fetchhub-4",
  rpcTarget: "https://rpc-fetchhub.fetch-ai.com",
  displayName: "fetch",
  blockExplorerUrl: "https://explore.fetch.ai/",
  ticker: "FET",
  tickerName: "Fetch Token",
  logo: "https://fetch.ai/static/media/fetch-logo.1f0c04c4.svg",
};
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FormattedMessage, useIntl } from "react-intl";
import { Form, Label } from "reactstrap";
import { BackButton } from "..";
import style from "./style.module.scss";
// eslint-disable-next-line import/no-extraneous-dependencies
import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import { AuthApiKey } from "../../../config.ui";
import { useStore } from "../../../stores";
import { SelectNetwork } from "../select-network";
import classNames from "classnames";
import { getNextDefaultAccountName, validateWalletName } from "@utils/index";

export const AuthIntro: FunctionComponent<{
  registerConfig: RegisterConfig;
  onClick?: () => void;
}> = observer(({ registerConfig, onClick }) => {
  const { analyticsStore } = useStore();

  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const isEnvDevelopment = process.env.NODE_ENV !== "production";
  useEffect(() => {
    if (!AuthApiKey) return;
    const init = async () => {
      try {
        const web3authInstance = new Web3Auth({
          clientId: AuthApiKey,
          // Must match the network configured for this client ID on the
          // Web3Auth Dashboard (Sapphire Devnet for local DEV_AUTH_CLIENT_ID).
          web3AuthNetwork: isEnvDevelopment
            ? WEB3AUTH_NETWORK.SAPPHIRE_DEVNET
            : WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
          chains: [fetchChainConfig],
          defaultChainId: fetchChainConfig.chainId,
          mfaLevel: MFA_LEVELS.OPTIONAL,
        });
        setWeb3auth(web3authInstance);
        await web3authInstance.init();
      } catch (error) {
        console.error(error);
      }
    };

    init();
  }, [isEnvDevelopment]);

  const login = async () => {
    if (!web3auth) {
      return null;
    }
    return await web3auth.connectTo(WALLET_CONNECTORS.AUTH, {
      authConnection: AUTH_CONNECTION.GOOGLE,
    });
  };

  const logout = async () => {
    if (!web3auth) {
      return;
    }
    await web3auth.logout();
  };

  const getPrivateKey = async (
    connection: Awaited<ReturnType<typeof login>>
  ): Promise<string> => {
    if (!connection?.ethereumProvider) {
      return "";
    }
    const privateKey = await connection.ethereumProvider.request({
      method: "private_key",
    });
    return typeof privateKey === "string" ? privateKey : "";
  };

  const getUserInfo = async () => {
    if (!web3auth) {
      return;
    }
    const user = await web3auth.getUserInfo();
    return user.email;
  };

  return (
    <React.Fragment>
      {AuthApiKey && (
        <Card
          leftImageStyle={{ height: "32px", width: "32px" }}
          style={{
            height: "78px",
            fontSize: "14px",
            marginBottom: "10px",
          }}
          onClick={async (e: any) => {
            e.preventDefault();
            const target = e.target as HTMLElement;
            if (target.tagName === "A") {
              const url = target.getAttribute("href");
              if (url) {
                window.open(url, "_blank"); // Open the URL in a new window
              }
              return;
            }
            try {
              const connection = await login();
              const privateKey = await getPrivateKey(connection);
              if (!privateKey) return;
              registerConfig.setPrivateKey(privateKey);
              const email = await getUserInfo();
              registerConfig.setEmail(email || "");
              await logout();
              if (onClick) {
                onClick();
              }
            } catch (e) {
            } finally {
              analyticsStore.logEvent("continue_with_google_click", {
                registerType: "google",
              });
            }
          }}
          leftImage={require("@assets/svg/wireframe/google-icon.svg")}
          subheading={"Powered by Web3Auth"}
          heading={"Continue with Google"}
        />
      )}
    </React.Fragment>
  );
});

interface FormData {
  name: string;
  words: string;
  password: string;
  confirmPassword: string;
}
export const AuthPage: FunctionComponent<{
  registerConfig: RegisterConfig;
  selectedNetworks: string[];
  setSelectedNetworks: React.Dispatch<React.SetStateAction<string[]>>;
}> = observer(({ registerConfig, selectedNetworks, setSelectedNetworks }) => {
  const { keyRingStore } = useStore();
  const intl = useIntl();
  const accountList = keyRingStore.keyInfos;
  const defaultAccountName = getNextDefaultAccountName(accountList);
  const [newAccountName, setNewAccountName] = useState(defaultAccountName);
  const [errorMessage, setErrorMessage] = useState("");
  const [accountNameValidationError, setAccountNameValidationError] =
    useState(false);

  const {
    register,
    getValues,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: defaultAccountName,
      password: "",
      confirmPassword: "",
    },
  });
  const privateKey = Buffer.from(
    registerConfig.privateKey.trim().replace("0x", ""),
    "hex"
  );

  return (
    <React.Fragment>
      <BackButton
        onClick={() => {
          registerConfig.clear();
        }}
      />
      <Form
        className={style["formContainer"]}
        onSubmit={handleSubmit(async (data: FormData) => {
          registerConfig.createPrivateKey(
            data.name,
            privateKey as Uint8Array,
            data.password,
            { email: registerConfig.email },
            selectedNetworks
          );
        })}
      >
        <Label for="name" className={style["label"]}>
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
          maxLength={20}
          onChange={(e) => {
            setErrorMessage("");
            const trimmedValue = e.target.value.trimStart();
            setValue(e.target.name as keyof FormData, trimmedValue);
            setNewAccountName(trimmedValue);
            const { isValid, isValidFormat, containsLetterOrNumber } =
              validateWalletName(
                trimmedValue,
                keyRingStore?.keyInfos,
                registerConfig.mode
              );
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
          error={
            accountNameValidationError
              ? errorMessage
              : errors.name && errors.name.message
          }
          style={{ width: "333px !important" }}
        />
        <div
          className={classNames(
            style["label"],
            "mb-2 text-xs",
            newAccountName === defaultAccountName ||
              accountNameValidationError ||
              (errors.name && errors.name.message)
              ? "invisible"
              : "visible"
          )}
        >
          * (Account name for unselected networks will be {defaultAccountName})
        </div>
        <SelectNetwork
          className="mb-4"
          selectedNetworks={selectedNetworks}
          disabled={newAccountName === defaultAccountName}
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
                validate: (password: string): string | undefined => {
                  if (password.length < 8) {
                    return intl.formatMessage({
                      id: "register.create.input.password.error.too-short",
                    });
                  }
                },
              })}
              containerStyle={{ width: "100%" }}
              error={errors.password && errors.password.message}
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
              passwordLabel="Confirm Password"
              containerStyle={{ width: "100%" }}
              error={errors.confirmPassword && errors.confirmPassword.message}
            />
          </React.Fragment>
        ) : null}
        <ButtonV2
          text={
            registerConfig.isLoading ? (
              <i className="fas fa-spinner fa-spin ml-2" />
            ) : (
              <FormattedMessage id="register.create.button.next" />
            )
          }
          disabled={
            registerConfig.isLoading ||
            accountNameValidationError ||
            (selectedNetworks.length === 0 &&
              newAccountName !== defaultAccountName)
          }
          data-loading={registerConfig.isLoading}
        />
      </Form>
    </React.Fragment>
  );
});
