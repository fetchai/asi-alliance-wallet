import React, { FunctionComponent, useState } from "react";
import { SettingItem } from "screens/setting/components";
import { useStore } from "stores/index";
import delay from "delay";
import { PasswordInputModal } from "modals/password-input/modal";
import { Platform, Switch, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { FingerPrintIconWithoutCircle } from "components/new/icon/finger-print";
import { observer } from "mobx-react-lite";

export const SettingBiometricLockItem: FunctionComponent = observer(() => {
  const { keychainStore } = useStore();

  const style = useStyle();

  const [isOpenModal, setIsOpenModal] = useState(false);
  /*
    isTurnOffBiometryFallback indicates that the modal is for turning off the biometry
    when failing to check the password to turn off by the biometry.
    This is mainly used to give the chance to the user when the biometry information changed after turning on the biometry sign-in.
   */
  const [isTurnOffBiometryFallback, setIsTurnOffBiometryFallback] =
    useState(false);

  return (
    <React.Fragment>
      <PasswordInputModal
        title={
          !isTurnOffBiometryFallback
            ? keychainStore.biometryType === "FaceID"
              ? "Enable Face ID"
              : keychainStore.biometryType === "TouchID"
              ? "Enable Touch ID"
              : "Enable Biometric Authentication"
            : keychainStore.biometryType === "FaceID"
            ? "Disable Face ID"
            : keychainStore.biometryType === "TouchID"
            ? "Disable Touch ID"
            : "Disable Biometric Authentication"
        }
        isOpen={isOpenModal}
        close={() => {
          setIsOpenModal(false);
          setIsTurnOffBiometryFallback(false);
        }}
        onEnterPassword={async (password) => {
          // Because javascript is synchronous language, the loadnig state change would not delivered to the UI thread
          // So to make sure that the loading state changes, just wait very short time.
          await delay(10);

          if (!isTurnOffBiometryFallback) {
            await keychainStore.turnOnBiometry(password);
          } else {
            await keychainStore.turnOffBiometryWithPassword(password);
          }
        }}
      />
      <SettingItem
        label={
          keychainStore.biometryType === "FaceID"
            ? "Use Face ID"
            : keychainStore.biometryType === "TouchID"
            ? "Use Touch ID"
            : "Use Biometric Authentication"
        }
        left={<FingerPrintIconWithoutCircle size={16} />}
        right={
          <Switch
            trackColor={{
              false: "#DCDCE3",
              true: Platform.OS === "ios" ? "#ffffff00" : "#DCDCE3",
            }}
            thumbColor={keychainStore.isBiometryOn ? "#73A271" : "#9A9AA2"}
            onValueChange={async (value) => {
              if (value) {
                setIsOpenModal(true);
                setIsTurnOffBiometryFallback(false);
              } else {
                try {
                  await keychainStore.turnOffBiometry();
                } catch (e) {
                  console.log(e);
                  setIsOpenModal(true);
                  setIsTurnOffBiometryFallback(true);
                }
              }
            }}
            value={keychainStore.isBiometryOn}
          />
        }
        style={style.flatten(["height-72", "padding-18"]) as ViewStyle}
      />
    </React.Fragment>
  );
});
