import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { RegisterConfig } from "@keplr-wallet/hooks";
import { useStyle } from "styles/index";
import { useSmartNavigation } from "navigation/smart-navigation";
import { Controller, useForm } from "react-hook-form";
import { PageWithScrollView } from "components/page";
import { Platform, Text, View, ViewStyle } from "react-native";
import { Button } from "components/button";
import Web3Auth, {
  AUTH_CONNECTION,
  CHAIN_NAMESPACES,
  MFA_LEVELS,
  WEB3AUTH_NETWORK,
} from "@web3auth/react-native-sdk";
import type { AUTH_CONNECTION_TYPE } from "@web3auth/react-native-sdk";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import Constants, { AppOwnership } from "expo-constants";
import * as Linking from "expo-linking";
import { useLoadingScreen } from "providers/loading-screen";
import { useStore } from "stores/index";
import { AuthApiKey, isWeb3AuthEnabled } from "../../../config";
import { InputCardView } from "components/new/card-view/input-card";
import { IconButton } from "components/new/button/icon";
import { EyeIcon } from "components/new/icon/eye";
import { HideEyeIcon } from "components/new/icon/hide-eye-icon";
import { PasswordValidateView } from "components/new/password-validate/password-validate";
import { XmarkIcon } from "components/new/icon/xmark";
import { CheckIcon } from "components/new/icon/check";
import DeviceInfo from "react-native-device-info";

const isEnvDevelopment = process.env["NODE_ENV"] !== "production";
const scheme = "fetchwallet";
const resolvedRedirectUrl =
  Constants.appOwnership === AppOwnership.Expo
    ? Linking.createURL("web3auth", {})
    : Linking.createURL("web3auth", { scheme });

// Cosmos/Fetch is not on the Embedded Wallets predefined list — pass via
// `chains` so init does not require a dashboard chain config.
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

// Lazy: `new Web3Auth` throws if clientId is empty, and this module is pulled in
// by register navigation even when social login is unused.
let web3auth: Web3Auth | null = null;
const getWeb3Auth = (): Web3Auth => {
  if (!isWeb3AuthEnabled) {
    throw new Error(
      "Missing AuthApiKey — set DEV_AUTH_CLIENT_ID / PROD_AUTH_CLIENT_ID in packages/mobile/.env"
    );
  }
  if (!web3auth) {
    web3auth = new Web3Auth(WebBrowser, SecureStore, {
      clientId: AuthApiKey,
      redirectUrl: resolvedRedirectUrl,
      // Must match the Web3Auth Dashboard network for this client ID.
      network: isEnvDevelopment
        ? WEB3AUTH_NETWORK.SAPPHIRE_DEVNET
        : WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
      // OTHER namespaces (e.g. fetchhub-4) may use non-hex chainIds. RN SDK only
      // allows hex `defaultChainId`, so omit it and let init pick chains[0].
      chains: [fetchChainConfig],
    });
  }
  return web3auth;
};

interface FormData {
  name: string;
  password: string;
}

const normalizePrivKeyHex = (value: unknown): string => {
  if (typeof value !== "string" || !value) {
    return "";
  }
  const hex = value.trim().replace(/^0x/i, "");
  // secp256k1 private keys are 32 bytes → 64 hex chars
  return /^[0-9a-fA-F]{64}$/.test(hex) ? hex : "";
};

const getPrivateKeyFromConnection = async (
  connection: Awaited<ReturnType<Web3Auth["connectTo"]>>
): Promise<string> => {
  if (!connection?.ethereumProvider) {
    return "";
  }
  try {
    const privateKey = await connection.ethereumProvider.request({
      method: "private_key",
    });
    return normalizePrivKeyHex(privateKey);
  } catch (e) {
    console.warn("[Web3Auth] private_key export failed", e);
    return "";
  }
};

const resolveEmail = (
  userInfo: ReturnType<Web3Auth["userInfo"]> | undefined,
  authConnection: AUTH_CONNECTION_TYPE
): string => {
  if (userInfo?.email) {
    return userInfo.email;
  }
  if (userInfo?.userId) {
    return `${userInfo.userId}@${authConnection}.web3auth`;
  }
  return `${authConnection}-user@web3auth.local`;
};

const useWeb3AuthSignIn = (
  authConnection: AUTH_CONNECTION_TYPE
): {
  privateKey: Uint8Array | undefined;
  email: string | undefined;
} => {
  const [privateKey, setPrivateKey] = useState<Uint8Array | undefined>();
  const [email, setEmail] = useState<string | undefined>();
  const loadingScreen = useLoadingScreen();
  const navigation = useNavigation();

  const applySession = async (
    connection: Awaited<ReturnType<Web3Auth["connectTo"]>>
  ) => {
    const client = getWeb3Auth();
    const hexKey =
      (await getPrivateKeyFromConnection(connection)) ||
      (await getPrivateKeyFromConnection(client.connection));
    if (!hexKey) {
      throw new Error(
        "Failed to export private key from Web3Auth (enable Key Export on the dashboard if disabled)"
      );
    }
    setEmail(resolveEmail(client.userInfo(), authConnection));
    setPrivateKey(Buffer.from(hexKey, "hex"));
  };

  const login = async () => {
    try {
      loadingScreen.setIsLoading(true);
      const client = getWeb3Auth();
      if (!client.ready) {
        console.error("Web3auth not initialized");
        return;
      }

      const connection = await client.connectTo({
        authConnection,
        mfaLevel: MFA_LEVELS.OPTIONAL,
      });

      // iOS: first login sometimes needs a re-init to pick up the session.
      if (!client.connected && Platform.OS === "ios") {
        await client.init();
      }

      if (!client.connected && !connection) {
        throw new Error("Web3Auth login did not establish a session");
      }

      await applySession(connection ?? client.connection);
    } catch (e: any) {
      console.log("[Web3Auth] login error", e?.message ?? e);
      navigation.goBack();
    } finally {
      loadingScreen.setIsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        if (!isWeb3AuthEnabled) {
          throw new Error(
            "Missing AuthApiKey — set DEV_AUTH_CLIENT_ID / PROD_AUTH_CLIENT_ID in packages/mobile/.env"
          );
        }
        const client = getWeb3Auth();
        if (!client.ready) {
          await client.init();
        }

        if (client.connected) {
          const userInfo = client.userInfo();
          const existingAuthConnection = userInfo?.authConnection;

          if (authConnection === existingAuthConnection) {
            try {
              await applySession(client.connection);
              return;
            } catch {
              // Fall through to a fresh login if the cached session has no key.
            }
          }
        }
        await login();
      } catch (e: any) {
        console.log("[Web3Auth] init error", e?.message ?? e);
        navigation.goBack();
      }
    };
    init();
    // Mount-only: authConnection is fixed for this screen instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    privateKey,
    email,
  };
};

const logoutWeb3Auth = async () => {
  if (!web3auth?.ready) {
    console.log("Web3auth not initialized");
    return;
  }

  await web3auth.logout();
};

export const TorusSignInScreen: FunctionComponent = observer(() => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          registerConfig: RegisterConfig;
          type: "google" | "apple";
        }
      >,
      string
    >
  >();

  const style = useStyle();

  const { analyticsStore } = useStore();

  const smartNavigation = useSmartNavigation();

  const isPad = DeviceInfo.getSystemName() === "iPadOS";

  const title =
    route.params.type === "apple"
      ? `Sign in with ${isPad ? "\n" : ""}Apple`
      : `Sign in with ${isPad ? "\n" : ""}Google`;

  const registerConfig: RegisterConfig = route.params.registerConfig;

  const [showPassword, setShowPassword] = useState(false);
  const [mode] = useState(registerConfig.mode);
  const [isCreating, setIsCreating] = useState(false);
  const [password, setPassword] = useState("");

  const {
    control,
    handleSubmit,
    setFocus,
    getValues,
    formState: { errors },
  } = useForm<FormData>();

  // Below uses the hook conditionally.
  // This is a silly way, but `route.params.type` never changed in the logic.
  const { privateKey, email } = useWeb3AuthSignIn(
    route.params.type === "apple"
      ? AUTH_CONNECTION.APPLE
      : AUTH_CONNECTION.GOOGLE
  );

  const submit = handleSubmit(async () => {
    setShowPassword(false);
    if (!privateKey) {
      console.log("[Web3Auth] Continue pressed but private key is missing");
      return;
    }

    setIsCreating(true);

    try {
      await registerConfig.createPrivateKey(
        getValues("name"),
        privateKey,
        getValues("password"),
        {
          email:
            email ||
            resolveEmail(
              undefined,
              route.params.type === "apple"
                ? AUTH_CONNECTION.APPLE
                : AUTH_CONNECTION.GOOGLE
            ),
          socialType: route.params.type,
        }
      );
      analyticsStore.setUserProperties({
        registerType: route.params.type,
        accountType: "privateKey",
      });
      analyticsStore.logEvent("register_done_click", {
        pageName: title,
        registerType: route.params.type,
      });
      smartNavigation.reset({
        index: 0,
        routes: [
          {
            name: "Register.End",
            params: {
              password: getValues("password"),
            },
          },
        ],
      });
    } catch (e) {
      console.log("[Web3Auth] createPrivateKey failed", e);
    } finally {
      setIsCreating(false);
      await logoutWeb3Auth();
    }
  });

  const checkPasswordValidity = (value: string) => {
    const error = [];

    const isContainsUppercase = /^(?=.*[A-Z]).*$/;
    if (!isContainsUppercase.test(value)) {
      error.push("uppercase");
    }

    const isContainsLowercase = /^(?=.*[a-z]).*$/;
    if (!isContainsLowercase.test(value)) {
      error.push("lowercase");
    }

    const isContainsSymbol =
      /^(?=.*[~`!@#$%^&*()--+={}\[\]|\\:;"'<>,.?/_₹]).*$/;
    if (!isContainsSymbol.test(value)) {
      error.push("special character");
    }

    if (value.length < 8) {
      error.push("At least 8 characters");
    }
    return error;
  };

  return (
    <PageWithScrollView
      backgroundMode="secondary"
      contentContainerStyle={style.get("flex-grow-1")}
      style={style.flatten(["padding-x-page", "overflow-scroll"]) as ViewStyle}
    >
      <Text
        style={
          style.flatten([
            "h1",
            "color-black",
            "margin-y-10",
            "font-medium",
          ]) as ViewStyle
        }
      >
        {title}
      </Text>
      <Text style={style.flatten(["body2", "color-gray-400"]) as ViewStyle}>
        To keep your account safe, avoid any personal information or words
      </Text>
      <Controller
        control={control}
        rules={{
          required: "Name is required",
          validate: (value: string) => {
            if (value.trim().length < 3) {
              return "Name at least 3 characters";
            }
          },
        }}
        render={({ field: { onChange, onBlur, value, ref } }) => {
          return (
            <InputCardView
              label="Account name"
              labelStyle={style.flatten(["color-gray-300"]) as ViewStyle}
              inputStyle={style.flatten(["color-black"]) as ViewStyle}
              containerStyle={style.flatten(["margin-top-18"]) as ViewStyle}
              returnKeyType={mode === "add" ? "done" : "next"}
              onSubmitEditing={() => {
                if (mode === "add") {
                  submit();
                }
                if (mode === "create") {
                  setFocus("password");
                }
              }}
              error={errors.name?.message}
              onBlur={() => {
                onBlur();
                onChange(value.trim());
              }}
              onChangeText={(text: string) => {
                text = text.replace(
                  /[~`!#$%^&*()+={}\[\]|\\:;"'<>,.?/₹•€£]/,
                  ""
                );
                if (text[0] === " " || text[0] === "-") {
                  return;
                }
                if (
                  (text[text.length - 1] === "-" && text[text.length - 2]) ===
                  "-"
                ) {
                  return;
                }
                text = text.replace(/ {1,}/g, " ");
                onChange(text);
              }}
              value={value}
              maxLength={30}
              ref={ref}
            />
          );
        }}
        name="name"
        defaultValue=""
      />
      {mode === "create" && (
        <React.Fragment>
          <Controller
            control={control}
            rules={{
              required: "Password is required",
              validate: (value: string) => {
                if (checkPasswordValidity(value).toString()) {
                  return checkPasswordValidity(value).toString();
                }
              },
            }}
            render={({ field: { onChange, onBlur, value, ref } }) => {
              return (
                <InputCardView
                  label="Create wallet password"
                  labelStyle={style.flatten(["color-gray-300"]) as ViewStyle}
                  inputStyle={style.flatten(["color-black"]) as ViewStyle}
                  containerStyle={style.flatten(["margin-top-8"]) as ViewStyle}
                  keyboardType={"default"}
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
                  onSubmitEditing={submit}
                  error={errors.password?.message}
                  errorMassageShow={false}
                  onBlur={onBlur}
                  onChangeText={(text: string) => {
                    const next = text.trim();
                    onChange(next);
                    setPassword(next);
                  }}
                  value={value}
                  ref={ref}
                  rightIcon={
                    !showPassword ? (
                      <IconButton
                        icon={<EyeIcon color="black" />}
                        backgroundBlur={false}
                        onPress={() => {
                          setShowPassword(!showPassword);
                        }}
                      />
                    ) : (
                      <IconButton
                        icon={<HideEyeIcon color="black" />}
                        backgroundBlur={false}
                        onPress={() => {
                          setShowPassword(!showPassword);
                        }}
                      />
                    )
                  }
                />
              );
            }}
            name="password"
            defaultValue=""
          />
          <View style={style.flatten(["margin-y-18"]) as ViewStyle}>
            {password ? (
              <React.Fragment>
                <PasswordValidateView
                  text="At least 8 characters"
                  icon={
                    checkPasswordValidity(password).includes(
                      "At least 8 characters"
                    ) ? (
                      <XmarkIcon size={6} color="black" />
                    ) : (
                      <CheckIcon size={6} color="black" />
                    )
                  }
                  iconStyle={
                    style.flatten(
                      ["padding-4"],
                      [
                        checkPasswordValidity(password).includes(
                          "At least 8 characters"
                        )
                          ? "background-color-red-400"
                          : "background-color-green-400",
                      ]
                    ) as ViewStyle
                  }
                />
                <PasswordValidateView
                  text="Minimum 1 special character"
                  icon={
                    checkPasswordValidity(password).includes(
                      "special character"
                    ) ? (
                      <XmarkIcon size={6} color="black" />
                    ) : (
                      <CheckIcon size={6} color="black" />
                    )
                  }
                  iconStyle={
                    style.flatten(
                      ["padding-4"],
                      [
                        checkPasswordValidity(password).includes(
                          "special character"
                        )
                          ? "background-color-red-400"
                          : "background-color-green-400",
                      ]
                    ) as ViewStyle
                  }
                />
                <PasswordValidateView
                  text="Minimum 1 lowercase character"
                  icon={
                    checkPasswordValidity(password).includes("lowercase") ? (
                      <XmarkIcon size={6} color="black" />
                    ) : (
                      <CheckIcon size={6} color="black" />
                    )
                  }
                  iconStyle={
                    style.flatten(
                      ["padding-4"],
                      [
                        checkPasswordValidity(password).includes("lowercase")
                          ? "background-color-red-400"
                          : "background-color-green-400",
                      ]
                    ) as ViewStyle
                  }
                />
                <PasswordValidateView
                  text="Minimum 1 uppercase character"
                  icon={
                    checkPasswordValidity(password).includes("uppercase") ? (
                      <XmarkIcon size={6} color="black" />
                    ) : (
                      <CheckIcon size={6} color="black" />
                    )
                  }
                  iconStyle={
                    style.flatten(
                      ["padding-4"],
                      [
                        checkPasswordValidity(password).includes("uppercase")
                          ? "background-color-red-400"
                          : "background-color-green-400",
                      ]
                    ) as ViewStyle
                  }
                />
              </React.Fragment>
            ) : (
              <React.Fragment>
                <PasswordValidateView text="At least 8 characters" />
                <PasswordValidateView text="Minimum 1 special character" />
                <PasswordValidateView text="Minimum 1 lowercase character" />
                <PasswordValidateView text="Minimum 1 uppercase character" />
              </React.Fragment>
            )}
          </View>
        </React.Fragment>
      )}
      <View style={style.flatten(["flex-1"])} />
      <Button
        containerStyle={
          style.flatten([
            "margin-y-18",
            "background-color-dark",
            "border-radius-32",
          ]) as ViewStyle
        }
        textStyle={style.flatten(["color-white"]) as ViewStyle}
        text="Continue"
        size="large"
        loading={isCreating}
        onPress={() => {
          submit();
        }}
        disabled={!privateKey}
      />
    </PageWithScrollView>
  );
});
