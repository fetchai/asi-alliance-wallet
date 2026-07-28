import React, { FunctionComponent, useState } from "react";
import { Alert, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { PageWithScrollView } from "components/page";
import { InputCardView } from "components/new/card-view/input-card";
import { IconButton } from "components/new/button/icon";
import { EyeIcon } from "components/new/icon/eye";
import { HideEyeIcon } from "components/new/icon/hide-eye-icon";
import { Button } from "components/button";
import { useStore } from "stores/index";
import { useNavigation } from "@react-navigation/native";
import { PasswordValidateView } from "components/new/password-validate/password-validate";
import { CheckIcon } from "components/new/icon/check";
import { XmarkIcon } from "components/new/icon/xmark";
import { observer } from "mobx-react-lite";

const checkPasswordValidity = (value: string): string[] => {
  const errors: string[] = [];
  if (!/^(?=.*[A-Z]).*$/.test(value)) errors.push("uppercase");
  if (!/^(?=.*[a-z]).*$/.test(value)) errors.push("lowercase");
  if (!/^(?=.*[~`!@#$%^&*()--+={}\[\]|\\:;"'<>,.?/_₹]).*$/.test(value))
    errors.push("special character");
  if (value.length < 8) errors.push("At least 8 characters");
  return errors;
};

export const ChangePasswordScreen: FunctionComponent = observer(() => {
  const { keyRingStore } = useStore();
  const style = useStyle();
  const navigation = useNavigation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [currentPasswordError, setCurrentPasswordError] = useState<
    string | undefined
  >();
  const [confirmPasswordError, setConfirmPasswordError] = useState<
    string | undefined
  >();
  const [isLoading, setIsLoading] = useState(false);

  const currentPasswordErrors = currentPassword
    ? checkPasswordValidity(currentPassword)
    : [];
  const isCurrentPasswordValid =
    currentPassword.length > 0 && currentPasswordErrors.length === 0;

  const newPasswordErrors = newPassword
    ? checkPasswordValidity(newPassword)
    : [];
  const isNewPasswordValid =
    newPassword.length > 0 && newPasswordErrors.length === 0;
  const isDifferentFromCurrent =
    !currentPassword || newPassword !== currentPassword;
  const passwordsMatch =
    confirmPassword.length > 0 && confirmPassword === newPassword;

  const canSubmit =
    isCurrentPasswordValid &&
    isNewPasswordValid &&
    isDifferentFromCurrent &&
    passwordsMatch &&
    !isLoading;

  const handleChangePassword = async () => {
    setIsLoading(true);
    setCurrentPasswordError(undefined);
    try {
      const isValid = await keyRingStore.checkPassword(currentPassword);
      if (!isValid) {
        setCurrentPasswordError("Current password is incorrect");
        setIsLoading(false);
        return;
      }
      await keyRingStore.updatePassword(currentPassword, newPassword);
      Alert.alert("Success", "Password changed successfully", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Unable to change password");
    } finally {
      setIsLoading(false);
    }
  };

  const renderEyeIcon = (show: boolean, onToggle: () => void) =>
    !show ? (
      <IconButton
        icon={<EyeIcon />}
        backgroundBlur={false}
        onPress={onToggle}
      />
    ) : (
      <IconButton
        icon={<HideEyeIcon />}
        backgroundBlur={false}
        onPress={onToggle}
      />
    );

  return (
    <PageWithScrollView
      backgroundMode="secondary"
      contentContainerStyle={style.get("flex-grow-1")}
      style={style.flatten(["padding-x-page"]) as ViewStyle}
    >
      <InputCardView
        label="Current Password"
        labelStyle={style.flatten(["margin-y-12"]) as ViewStyle}
        containerStyle={style.flatten(["margin-top-18"]) as ViewStyle}
        secureTextEntry={!showCurrent}
        value={currentPassword}
        error={
          currentPasswordError ||
          (currentPassword && currentPasswordErrors.length > 0
            ? "Password must be at least 8 characters with uppercase, lowercase, and special character"
            : undefined)
        }
        returnKeyType="next"
        onChangeText={(text: string) => {
          setCurrentPassword(text.trim());
          setCurrentPasswordError(undefined);
        }}
        rightIcon={renderEyeIcon(showCurrent, () => setShowCurrent((v) => !v))}
      />
      <InputCardView
        label="New Password"
        labelStyle={style.flatten(["margin-y-12"]) as ViewStyle}
        containerStyle={style.flatten(["margin-top-8"]) as ViewStyle}
        secureTextEntry={!showNew}
        value={newPassword}
        returnKeyType="next"
        onChangeText={(text: string) => {
          setNewPassword(text.trim());
          if (confirmPassword && text.trim() !== confirmPassword) {
            setConfirmPasswordError("Passwords do not match");
          } else {
            setConfirmPasswordError(undefined);
          }
        }}
        rightIcon={renderEyeIcon(showNew, () => setShowNew((v) => !v))}
      />
      {newPassword ? (
        <View
          style={
            style.flatten(["margin-top-8", "margin-bottom-4"]) as ViewStyle
          }
        >
          <PasswordValidateView
            text="At least 8 characters"
            icon={
              newPasswordErrors.includes("At least 8 characters") ? (
                <XmarkIcon size={6} color="black" />
              ) : (
                <CheckIcon size={6} color="black" />
              )
            }
            iconStyle={
              style.flatten(
                ["padding-4"],
                [
                  newPasswordErrors.includes("At least 8 characters")
                    ? "background-color-red-400"
                    : "background-color-green-400",
                ]
              ) as ViewStyle
            }
          />
          <PasswordValidateView
            text="Minimum 1 special character"
            icon={
              newPasswordErrors.includes("special character") ? (
                <XmarkIcon size={6} color="black" />
              ) : (
                <CheckIcon size={6} color="black" />
              )
            }
            iconStyle={
              style.flatten(
                ["padding-4"],
                [
                  newPasswordErrors.includes("special character")
                    ? "background-color-red-400"
                    : "background-color-green-400",
                ]
              ) as ViewStyle
            }
          />
          <PasswordValidateView
            text="Minimum 1 lowercase character"
            icon={
              newPasswordErrors.includes("lowercase") ? (
                <XmarkIcon size={6} color="black" />
              ) : (
                <CheckIcon size={6} color="black" />
              )
            }
            iconStyle={
              style.flatten(
                ["padding-4"],
                [
                  newPasswordErrors.includes("lowercase")
                    ? "background-color-red-400"
                    : "background-color-green-400",
                ]
              ) as ViewStyle
            }
          />
          <PasswordValidateView
            text="Minimum 1 uppercase character"
            icon={
              newPasswordErrors.includes("uppercase") ? (
                <XmarkIcon size={6} color="black" />
              ) : (
                <CheckIcon size={6} color="black" />
              )
            }
            iconStyle={
              style.flatten(
                ["padding-4"],
                [
                  newPasswordErrors.includes("uppercase")
                    ? "background-color-red-400"
                    : "background-color-green-400",
                ]
              ) as ViewStyle
            }
          />
          {currentPassword.length > 0 && !isDifferentFromCurrent && (
            <PasswordValidateView
              text="New password must be different from current"
              icon={<XmarkIcon size={6} color="black" />}
              iconStyle={
                style.flatten([
                  "padding-4",
                  "background-color-red-400",
                ]) as ViewStyle
              }
            />
          )}
        </View>
      ) : null}
      <InputCardView
        label="Confirm Password"
        labelStyle={style.flatten(["margin-y-12"]) as ViewStyle}
        containerStyle={style.flatten(["margin-top-8"]) as ViewStyle}
        secureTextEntry={!showConfirm}
        value={confirmPassword}
        error={confirmPasswordError}
        returnKeyType="done"
        onSubmitEditing={canSubmit ? handleChangePassword : undefined}
        onChangeText={(text: string) => {
          setConfirmPassword(text.trim());
          if (text.trim() && text.trim() !== newPassword) {
            setConfirmPasswordError("Passwords do not match");
          } else {
            setConfirmPasswordError(undefined);
          }
        }}
        rightIcon={renderEyeIcon(showConfirm, () => setShowConfirm((v) => !v))}
      />
      <View style={style.flatten(["flex-1"]) as ViewStyle} />
      <Button
        text="Change Password"
        size="large"
        disabled={!canSubmit}
        loading={isLoading}
        containerStyle={
          [
            style.flatten([
              "border-radius-64",
              "margin-y-18",
              "background-color-dark",
            ]),
            { opacity: canSubmit ? 1 : 0.8 },
          ] as ViewStyle
        }
        textStyle={style.flatten(["body2", "color-white"]) as ViewStyle}
        onPress={handleChangePassword}
      />
    </PageWithScrollView>
  );
});
