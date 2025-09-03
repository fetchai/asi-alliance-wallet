import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { RegisterConfig } from "@keplr-wallet/hooks";
import { useStyle } from "styles/index";
import { useSmartNavigation } from "navigation/smart-navigation";
import { Controller, useForm } from "react-hook-form";
import { PageWithScrollView } from "components/page";
import { Text, View, ViewStyle } from "react-native";
import { Button } from "components/button";
import Web3Auth, { LOGIN_PROVIDER } from "@web3auth/react-native-sdk";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import Constants, { AppOwnership } from "expo-constants";
import * as Linking from "expo-linking";
import { useLoadingScreen } from "providers/loading-screen";
import { useStore } from "stores/index";
import { LOGIN_PROVIDER_TYPE } from "@toruslabs/openlogin-utils/dist/types/interfaces";
import { AuthApiKey } from "../../../config";
import { InputCardView } from "components/new/card-view/input-card";
import { IconButton } from "components/new/button/icon";
import { EyeIcon } from "components/new/icon/eye";
import { HideEyeIcon } from "components/new/icon/hide-eye-icon";
import { PasswordValidateView } from "components/new/password-validate/password-validate";
import { XmarkIcon } from "components/new/icon/xmark";
import { CheckIcon } from "components/new/icon/check"; // for using ethers.js
import DeviceInfo from "react-native-device-info";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";
import { CommonPrivateKeyProvider } from "@web3auth/base-provider";
import CosmosRpc from "./cosmos-rpc";

const isEnvDevelopment = process.env["NODE_ENV"] !== "production";
const scheme = "fetchwallet";
const resolvedRedirectUrl =
  Constants.appOwnership === AppOwnership.Expo
    ? Linking.createURL("web3auth", {})
    : Linking.createURL("web3auth", { scheme });

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.OTHER,
  chainId: "fetchhub-4",
  rpcTarget: "https://rpc-fetchhub.fetch-ai.com",
  displayName: "fetch",
  blockExplorer: "https://explore.fetch.ai/",
  ticker: "FET",
  tickerName: "Fetch Token",
};

const privateKeyProvider = new CommonPrivateKeyProvider({
  config: {
    chainConfig,
  },
});

const network = isEnvDevelopment
  ? WEB3AUTH_NETWORK.TESTNET
  : WEB3AUTH_NETWORK.CYAN;

const web3auth = new Web3Auth(WebBrowser, SecureStore, {
  clientId: AuthApiKey,
  redirectUrl: resolvedRedirectUrl,
  network,
  privateKeyProvider,
});

interface FormData {
  name: string;
  password: string;
}

const useWeb3AuthSignIn = (
  type: LOGIN_PROVIDER_TYPE
): {
  privateKey: Uint8Array | undefined;
  email: string | undefined;
} => {
  const [privateKey, setPrivateKey] = useState<Uint8Array | undefined>();
  const [email, setEmail] = useState<string | undefined>();
  const loadingScreen = useLoadingScreen();
  const navigation = useNavigation();

  const login = async () => {
    try {
      loadingScreen.setIsLoading(true);
      if (!web3auth.ready) {
        console.error("Web3auth not initialized");
        return;
      }

      await web3auth.login({
        loginProvider: type,
      });

      if (web3auth.connected) {
        const privateKey = await getPrivateKey(privateKeyProvider);
        setEmail(web3auth?.userInfo()?.email);
        setPrivateKey(Buffer.from(privateKey, "hex"));
      }
    } catch (e: any) {
      console.log(e.message);
      navigation.goBack();
    } finally {
      loadingScreen.setIsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await web3auth.init();

      if (web3auth.connected) {
        const userInfo = web3auth.userInfo();
        const typeOfLogin = userInfo?.typeOfLogin;

        if (type == typeOfLogin) {
          setEmail(userInfo?.email);
          const privateKey = await getPrivateKey(privateKeyProvider);
          setPrivateKey(Buffer.from(privateKey, "hex"));
        } else {
          await login();
        }
      } else {
        await login();
      }
    };
    init();
  }, []);

  const getPrivateKey = async (provider: any) => {
    if (!provider) {
      return "";
    }
    const rpc = new CosmosRpc(provider);
    return await rpc.getPrivateKey();
  };

  return {
    privateKey,
    email,
  };
};

const logoutWeb3Auth = async () => {
  if (!web3auth.ready) {
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
    route.params.type === "apple" ? LOGIN_PROVIDER.APPLE : LOGIN_PROVIDER.GOOGLE
  );

  const submit = handleSubmit(async () => {
    setShowPassword(false);
    if (!privateKey || !email) {
      return;
    }

    setIsCreating(true);

    try {
      await registerConfig.createPrivateKey(
        getValues("name"),
        privateKey,
        getValues("password"),
        { email, socialType: route.params.type }
      );
      analyticsStore.setUserProperties({
        registerType: route.params.type,
        accountType: "privateKey",
      });
      analyticsStore.logEvent("register_done_click", {
        pageName: title,
        registerType: "apple",
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
      console.log(e);
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
      backgroundMode="image"
      contentContainerStyle={style.get("flex-grow-1")}
      style={style.flatten(["padding-x-page", "overflow-scroll"]) as ViewStyle}
    >
      <Text
        style={
          style.flatten([
            "h1",
            "color-white",
            "margin-y-10",
            "font-medium",
          ]) as ViewStyle
        }
      >
        {title}
      </Text>
      <Text style={style.flatten(["h6", "color-gray-200"]) as ViewStyle}>
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
              setPassword(value);

              return (
                <InputCardView
                  label="Create wallet password"
                  containerStyle={style.flatten(["margin-top-8"]) as ViewStyle}
                  keyboardType={"default"}
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
                  onSubmitEditing={submit}
                  error={errors.password?.message}
                  errorMassageShow={false}
                  onBlur={onBlur}
                  onChangeText={(text: string) => onChange(text.trim())}
                  value={value}
                  ref={ref}
                  rightIcon={
                    !showPassword ? (
                      <IconButton
                        icon={<EyeIcon />}
                        backgroundBlur={false}
                        onPress={() => {
                          setShowPassword(!showPassword);
                        }}
                      />
                    ) : (
                      <IconButton
                        icon={<HideEyeIcon />}
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
            "background-color-white",
            "border-radius-32",
          ]) as ViewStyle
        }
        textStyle={{
          color: "#0B1742",
        }}
        text="Continue"
        size="large"
        loading={isCreating}
        onPress={() => {
          submit();
        }}
        disabled={!privateKey || !email}
      />
    </PageWithScrollView>
  );
});
