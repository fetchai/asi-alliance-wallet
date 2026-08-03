import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import { BIP44HDPath } from "@keplr-wallet/background";
import { RegisterConfig } from "@keplr-wallet/hooks";
import { RouteProp, useRoute } from "@react-navigation/native";
import { IconButton } from "components/new/button/icon";
import { InputCardView } from "components/new/card-view/input-card";
import { PageWithScrollView } from "components/page";
import { Text, ViewStyle, View } from "react-native";
import { useStyle } from "styles/index";
import { EyeIcon } from "components/new/icon/eye";
import { Button } from "components/button";
import { Controller, useForm } from "react-hook-form";
import { useStore } from "stores/index";
import { useSmartNavigation } from "navigation/smart-navigation";
import { SelectNetwork } from "components/new/select-network";
import {
  isPrivateKey,
  trimWordsStr,
  getNextDefaultAccountName,
  validateAccountName,
} from "utils/format/format";
import { PasswordValidateView } from "components/new/password-validate/password-validate";
import { CheckIcon } from "components/new/icon/check";
import { XmarkIcon } from "components/new/icon/xmark";
import { HideEyeIcon } from "components/new/icon/hide-eye-icon";

interface FormData {
  mnemonic: string;
  name: string;
  password: string;
}

export const CreateAccountScreen: FunctionComponent = () => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          registerConfig: RegisterConfig;
          mnemonic: string;
          bip44HDPath: BIP44HDPath;
          title: string;
        }
      >,
      string
    >
  >();

  const registerConfig = route.params.registerConfig;
  const bip44HDPath = route.params.bip44HDPath;
  const mnemonic = JSON.parse(decodeURIComponent(route.params.mnemonic));
  const title = route.params.title ? route.params.title : "Create your wallet";

  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [mode] = useState(registerConfig.mode);
  const [isCreating, setIsCreating] = useState(false);
  const isSubmittingRef = useRef(false);
  const [selectedNetworks, setSelectedNetworks] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | undefined>();

  const smartNavigation = useSmartNavigation();

  const style = useStyle();
  const { analyticsStore, keyRingStore } = useStore();
  const defaultAccountName = getNextDefaultAccountName(
    keyRingStore.multiKeyStoreInfo
  );

  useEffect(() => {
    setValue("mnemonic", mnemonic, {
      shouldValidate: true,
    });
  }, [mnemonic]);

  const {
    control,
    handleSubmit,
    setFocus,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<FormData>();

  const currentName = watch("name", defaultAccountName);

  const submit = handleSubmit(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsCreating(true);
    setShowPassword(false);
    setSubmitError(undefined);

    try {
      const mnemonic = trimWordsStr(getValues("mnemonic"));

      if (!isPrivateKey(mnemonic)) {
        await registerConfig.createMnemonic(
          getValues("name").trim(),
          mnemonic,
          getValues("password"),
          bip44HDPath,
          {},
          selectedNetworks
        );
        analyticsStore.setUserProperties({
          registerType: "seed",
          accountType: "mnemonic",
        });
      } else {
        const privateKey = Buffer.from(
          mnemonic.trim().replace("0x", ""),
          "hex"
        );
        await registerConfig.createPrivateKey(
          getValues("name"),
          privateKey,
          getValues("password"),
          {},
          selectedNetworks
        );
        analyticsStore.setUserProperties({
          registerType: "seed",
          accountType: "privateKey",
        });
      }

      analyticsStore.logEvent("register_done_click", {
        pageName: "Register",
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
    } catch (e: any) {
      const msg: string = e?.message ?? "";
      if (
        msg.toLowerCase().includes("mnemonic") ||
        msg.toLowerCase().includes("seed")
      ) {
        setSubmitError(
          "Invalid seed phrase. Please go back and check your words."
        );
      } else {
        setSubmitError(msg || "Failed to create account. Please try again.");
      }
    } finally {
      isSubmittingRef.current = false;
      setIsCreating(false);
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
          validate: (value: string) =>
            validateAccountName(value, keyRingStore.multiKeyStoreInfo, mode),
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
                const filtered = text
                  .trimStart()
                  .replace(/[^a-zA-Z0-9 @_\-\.\(\)]/g, "")
                  .replace(/ {2,}/g, " ");
                onChange(filtered);
              }}
              value={value}
              maxLength={30}
              ref={ref}
            />
          );
        }}
        name="name"
        defaultValue={defaultAccountName}
      />
      {currentName !== defaultAccountName && (
        <Text
          style={
            style.flatten([
              "text-caption2",
              "color-gray-400",
              "margin-top-4",
            ]) as ViewStyle
          }
        >
          * Account name for unselected networks will be {defaultAccountName}
        </Text>
      )}
      <SelectNetwork
        selectedNetworks={selectedNetworks}
        disabled={currentName === defaultAccountName}
        onMultiSelectChange={setSelectedNetworks}
      />
      {currentName !== defaultAccountName && selectedNetworks.length === 0 && (
        <Text
          style={
            style.flatten([
              "text-caption2",
              "color-red-400",
              "margin-top-4",
            ]) as ViewStyle
          }
        >
          Please select at least one network
        </Text>
      )}
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
                  label="Password"
                  labelStyle={style.flatten(["color-gray-300"]) as ViewStyle}
                  inputStyle={style.flatten(["color-black"]) as ViewStyle}
                  keyboardType={"default"}
                  secureTextEntry={!showPassword}
                  containerStyle={style.flatten(["margin-top-8"]) as ViewStyle}
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    submit();
                  }}
                  error={errors.password?.message}
                  errorMassageShow={false}
                  onBlur={onBlur}
                  onChangeText={(text: string) => onChange(text.trim())}
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
      {submitError ? (
        <View
          style={
            style.flatten([
              "border-width-1",
              "border-radius-12",
              "border-color-red-400",
              "padding-10",
              "margin-bottom-12",
            ]) as ViewStyle
          }
        >
          <Text
            style={
              style.flatten([
                "color-red-400",
                "body2",
                "text-center",
              ]) as ViewStyle
            }
          >
            {submitError}
          </Text>
        </View>
      ) : null}
      <Button
        containerStyle={
          style.flatten([
            "margin-y-18",
            "background-color-dark",
            "color-white",
            "border-radius-32",
          ]) as ViewStyle
        }
        textStyle={style.flatten(["color-white"]) as ViewStyle}
        text="Confirm"
        size="large"
        disabled={
          currentName !== defaultAccountName && selectedNetworks.length === 0
        }
        loading={isCreating}
        onPress={() => {
          submit();
        }}
      />
    </PageWithScrollView>
  );
};
