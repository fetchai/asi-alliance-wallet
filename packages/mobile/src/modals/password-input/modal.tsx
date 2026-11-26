import React, { FunctionComponent, useEffect, useState } from "react";
import { ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { CardModal } from "../card";
import { Button } from "components/button";
import { KeyboardSpacerView } from "components/keyboard";
import { InputCardView } from "components/new/card-view/input-card";
import { IconButton } from "components/new/button/icon";
import { EyeIcon } from "components/new/icon/eye";
import { HideEyeIcon } from "components/new/icon/hide-eye-icon";
import { useStore } from "stores/index";

export const PasswordInputModal: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  title: string;
  /**
   * If any error thrown in the `onEnterPassword`, the password considered as invalid password.
   * @param password
   */
  onEnterPassword: (password: string) => Promise<void>;
}> = ({ close, title, onEnterPassword, isOpen }) => {
  const style = useStyle();
  const { analyticsStore } = useStore();

  const [password, setPassword] = useState("");
  const [isInvalidPassword, setIsInvalidPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setShowPassword(false);
    setPassword("");
    setIsInvalidPassword(false);
  }, [isOpen]);

  const submitPassword = async () => {
    setIsLoading(true);
    try {
      await onEnterPassword(password);
      setIsInvalidPassword(false);
      setPassword("");
      close();
    } catch (e) {
      console.log(e);
      setIsInvalidPassword(true);
      setPassword("");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <CardModal isOpen={isOpen} close={close} title={title}>
      <InputCardView
        label="Password"
        labelStyle={
          style.flatten(["margin-y-0", "margin-bottom-12"]) as ViewStyle
        }
        keyboardType={"default"}
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
        secureTextEntry={!showPassword}
        error={isInvalidPassword ? "Invalid password" : undefined}
        onChangeText={(text: string) => {
          setPassword(text.trim());
          setIsInvalidPassword(false);
        }}
        value={password}
        returnKeyType="done"
        onSubmitEditing={submitPassword}
      />
      <Button
        text="Continue"
        size="large"
        loading={isLoading}
        onPress={() => {
          submitPassword();
          analyticsStore.logEvent("continue_click", {
            pageName: "More",
          });
        }}
        disabled={!password}
        containerStyle={
          style.flatten(["border-radius-32", "margin-top-24"]) as ViewStyle
        }
      />
      <KeyboardSpacerView />
    </CardModal>
  );
};
