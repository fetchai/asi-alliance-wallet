import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Image,
  Platform,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { observer } from "mobx-react-lite";
import { useStyle } from "styles/index";
import * as SplashScreen from "expo-splash-screen";
import { Button } from "components/button";
import delay from "delay";
import { useStore } from "stores/index";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { StackActions, useNavigation } from "@react-navigation/native";
import { KeyRingStatus } from "@keplr-wallet/background";
import { KeychainStore } from "stores/keychain";
import { IAccountStore } from "@keplr-wallet/stores";
import { autorun } from "mobx";
import { FingerprintIcon } from "components/icon/fingerprint";
import { ScreenBackground } from "components/page";
import { InputCardView } from "components/new/card-view/input-card";
import { EyeIcon } from "components/new/icon/eye";
import { FaceDetectIcon } from "components/new/icon/face-icon";
import { IconButton } from "components/new/button/icon";
import { HideEyeIcon } from "components/new/icon/hide-eye-icon";
import Toast from "react-native-toast-message";
import { useSafeAreaInsets } from "react-native-safe-area-context";

let splashScreenHided = false;
async function hideSplashScreen() {
  if (!splashScreenHided) {
    if (await SplashScreen.hideAsync()) {
      splashScreenHided = true;
    }
  }
}

async function waitAccountLoad(
  accountStore: IAccountStore,
  chainId: string
): Promise<void> {
  if (accountStore.getAccount(chainId).bech32Address) {
    return;
  }

  return new Promise((resolve) => {
    const disposer = autorun(() => {
      if (accountStore.getAccount(chainId).bech32Address) {
        resolve();
        if (disposer) {
          disposer();
        }
      }
    });
  });
}

/*
 If the biomeric is on, just try to unlock by biometric automatically once.
 */
enum AutoBiomtricStatus {
  NO_NEED,
  NEED,
  FAILED,
  SUCCESS,
}

const useAutoBiomtric = (
  keychainStore: KeychainStore,
  tryEnabled: boolean,
  callback: (isLoading: boolean) => void,
  onError?: (e: Error) => void
) => {
  const [status, setStatus] = useState(AutoBiomtricStatus.NO_NEED);
  const tryBiometricAutoOnce = useRef(false);

  useEffect(() => {
    if (keychainStore.isBiometryOn && status === AutoBiomtricStatus.NO_NEED) {
      setStatus(AutoBiomtricStatus.NEED);
    }
  }, [keychainStore.isBiometryOn, status]);

  useEffect(() => {
    if (
      !tryBiometricAutoOnce.current &&
      status === AutoBiomtricStatus.NEED &&
      tryEnabled
    ) {
      tryBiometricAutoOnce.current = true;
      (async () => {
        try {
          // iOS only: if Face ID/Touch ID is not enrolled in Settings, skip the
          // native prompt entirely to avoid the system "incorrect passphrase" dialog.
          if (Platform.OS === "ios" && !keychainStore.isBiometrySupported) {
            setStatus(AutoBiomtricStatus.FAILED);
            callback(false);
            return;
          }
          callback(true);
          await keychainStore.tryUnlockWithBiometry();
          setStatus(AutoBiomtricStatus.SUCCESS);
        } catch (e) {
          console.log(e);
          setStatus(AutoBiomtricStatus.FAILED);
          if (onError) onError(e);
        } finally {
          callback(false);
        }
      })();
    }
  }, [keychainStore, status, tryEnabled]);

  return status;
};

/**
 * UnlockScreen is expected to be opened when the keyring store's state is "not loaded (yet)" or "locked" at launch.
 * And, this screen has continuity with the splash screen
 * @constructor
 */
export const UnlockScreen: FunctionComponent = observer(() => {
  const {
    keyRingStore,
    keychainStore,
    accountStore,
    chainStore,
    analyticsStore,
  } = useStore();

  const style = useStyle();

  const navigation = useNavigation();

  const safeAreaInsets = useSafeAreaInsets();

  const navigateToHomeOnce = useRef(false);
  const biometricNeedsReset = useRef(false);
  const navigateToHome = useCallback(async () => {
    if (!navigateToHomeOnce.current) {
      analyticsStore.logEvent("sign_in_click");
      // Wait the account of selected chain is loaded.
      await waitAccountLoad(accountStore, chainStore.current.chainId);
      navigation.dispatch(StackActions.replace("MainTabDrawer"));
    }
    navigateToHomeOnce.current = true;
  }, [accountStore, chainStore, navigation]);

  const autoBiometryStatus = useAutoBiomtric(
    keychainStore,
    keyRingStore.status === KeyRingStatus.LOCKED,
    (isLoading) => {
      setIsBiometricLoading(isLoading);
    },
    (e) => {
      if (e?.message?.includes("Unmatched mac")) {
        biometricNeedsReset.current = true;
        keychainStore.reset();
        Toast.show({
          type: "error",
          text1: "Biometric Verification Failed",
          text2:
            "Your password or biometric data has changed. Sign in with your password to re-enable it.",
        });
      }
    }
  );

  useEffect(() => {
    if (autoBiometryStatus === AutoBiomtricStatus.SUCCESS) {
      (async () => {
        await hideSplashScreen();
      })();
    }
  }, [autoBiometryStatus, navigation]);

  useEffect(() => {
    if (keyRingStore.status === KeyRingStatus.LOCKED) hideSplashScreen();
  }, [keyRingStore.status]);

  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const tryBiometric = useCallback(async () => {
    // iOS only: if Face ID/Touch ID is not enrolled in Settings, show a clear
    // message instead of triggering the system "incorrect passphrase" dialog.
    if (Platform.OS === "ios" && !keychainStore.isBiometrySupported) {
      const biometryLabel =
        keychainStore.biometryType === "FaceID"
          ? "Face ID"
          : keychainStore.biometryType === "TouchID"
          ? "Touch ID"
          : "Face ID";
      Toast.show({
        type: "error",
        text1: `${biometryLabel} not available`,
        text2: `Please enable ${biometryLabel} in iOS Settings and try again.`,
      });
      return;
    }
    try {
      setIsBiometricLoading(true);
      // Because javascript is synchronous language, the loadnig state change would not delivered to the UI thread
      // So to make sure that the loading state changes, just wait very short time.
      await delay(10);
      await keychainStore.tryUnlockWithBiometry();
    } catch (e) {
      console.log(e);
      const msg: string = e?.message ?? "";
      const biometryLabel =
        keychainStore.biometryType === "FaceID"
          ? "Face ID"
          : keychainStore.biometryType === "TouchID"
          ? "Touch ID"
          : "Biometric authentication";
      if (msg.includes("Unmatched mac")) {
        biometricNeedsReset.current = true;
        keychainStore.reset();
        Toast.show({
          type: "error",
          text1: "Biometric Verification Failed",
          text2:
            "Your password or biometric data has changed. Sign in with your password to re-enable it.",
        });
      } else if (msg.includes("code: 13") || msg.includes("user cancel")) {
        // User dismissed the prompt no toast needed
      } else {
        Toast.show({
          type: "error",
          text1: `${biometryLabel} unavailable`,
          text2:
            "Please ensure it is set up and this app has permission in Settings.",
        });
      }
      setIsBiometricLoading(false);
    }
  }, [keychainStore]);

  const tryUnlock = async () => {
    try {
      setShowPassword(false);
      setIsLoading(true);
      // Decryption needs slightly huge computation.
      // Because javascript is synchronous language, the loadnig state change would not delivered to the UI thread
      // before the actually decryption is complete.
      // So to make sure that the loading state changes, just wait very short time.
      await delay(10);
      await keyRingStore.unlock(password);
    } catch (e) {
      console.log(e);
      setIsLoading(false);
      setIsFailed(true);
      setPassword("");
    }
  };

  const routeToRegisterOnce = useRef(false);
  useEffect(() => {
    // If the keyring is empty,
    // route to the register screen.
    if (
      !routeToRegisterOnce.current &&
      keyRingStore.status === KeyRingStatus.EMPTY
    ) {
      (async () => {
        routeToRegisterOnce.current = true;
        navigation.dispatch(
          StackActions.replace("Register", {
            screen: "Register.Intro",
            params: { isBack: false },
          })
        );
        await delay(1000);
        hideSplashScreen();
      })();
    }
  }, [keyRingStore.status, navigation]);

  useEffect(() => {
    if (keyRingStore.status === KeyRingStatus.UNLOCKED) {
      if (biometricNeedsReset.current) {
        biometricNeedsReset.current = false;
        const biometryLabel =
          keychainStore.biometryType === "FaceID"
            ? "Face ID"
            : keychainStore.biometryType === "TouchID"
            ? "Touch ID"
            : "Biometric Login";
        Alert.alert(
          `Re-enable ${biometryLabel}`,
          `Your ${biometryLabel} was disabled because your credentials changed. Re-enable it now?`,
          [
            {
              text: "Not Now",
              style: "cancel",
              onPress: () => navigateToHome(),
            },
            {
              text: "Re-enable",
              onPress: async () => {
                try {
                  await keychainStore.turnOnBiometry(password);
                } catch (e) {
                  console.log(e);
                }
                navigateToHome();
              },
            },
          ]
        );
      } else {
        navigateToHome();
      }
    }
  }, [keyRingStore.status, navigateToHome, keychainStore, password]);

  if (
    [KeyRingStatus.EMPTY, KeyRingStatus.NOTLOADED].includes(keyRingStore.status)
  ) {
    return null;
  }

  return (
    <React.Fragment>
      <ScreenBackground
        backgroundMode="secondary"
        backgroundBlur={true}
        hasFloatingHeader={true}
      />
      <View
        style={
          [
            style.flatten(["flex", "flex-1", "justify-between"]),
            {
              paddingTop: Platform.OS === "ios" ? safeAreaInsets.top + 10 : 48,
            },
          ] as ViewStyle
        }
      >
        <KeyboardAwareScrollView
          contentContainerStyle={style.flatten(["flex-grow-1"]) as ViewStyle}
        >
          <View style={style.flatten(["items-center"]) as ViewStyle}>
            <Image
              source={require("assets/logo/logo-black.png")}
              style={{
                aspectRatio: 2.977,
                height: 60,
              }}
              resizeMode="contain"
              fadeDuration={0}
            />
          </View>
          <View
            style={
              style.flatten(["margin-x-page", "margin-top-34"]) as ViewStyle
            }
          >
            <Text style={style.flatten(["h2", "font-medium", "color-dark"])}>
              Welcome Back
            </Text>
            <Text
              style={
                style.flatten([
                  "h6",
                  "font-medium",
                  "color-gray-300",
                  "margin-top-12",
                ]) as ViewStyle
              }
            >
              {Platform.OS === "ios"
                ? `Enter your password or use ${
                    keychainStore.biometryType === "FaceID"
                      ? "Face ID"
                      : keychainStore.biometryType === "TouchID"
                      ? "Touch ID"
                      : "biometric authentication"
                  } to sign in`
                : "Enter your password or use biometric authentication to sign in"}
            </Text>
            <InputCardView
              label={"Password"}
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
              containerStyle={style.flatten(["margin-y-20"]) as ViewStyle}
              labelStyle={{ color: "#737676" } as ViewStyle}
              inputStyle={{ color: style.get("color-dark").color } as ViewStyle}
              secureTextEntry={!showPassword}
              value={password}
              returnKeyType="done"
              error={isFailed ? "Invalid password" : undefined}
              onSubmitEditing={tryUnlock}
              onChangeText={(text: string) => {
                setIsFailed(false);
                setPassword(text.trim());
              }}
            />
            <Button
              containerStyle={
                style.flatten([
                  "border-radius-32",
                  "margin-y-10",
                  "background-color-dark",
                ]) as ViewStyle
              }
              textStyle={style.flatten(["color-white"]) as ViewStyle}
              text="Sign In"
              size="large"
              loading={isLoading}
              rippleColor="black@10%"
              onPress={tryUnlock}
              disabled={password.length === 0}
            />
          </View>
          <View style={style.get("flex-4")} />
          {keychainStore.isBiometryOn ? (
            <TouchableOpacity onPress={tryBiometric} activeOpacity={1}>
              <View
                style={
                  style.flatten([
                    "flex",
                    "margin-bottom-40",
                    "margin-top-10",
                  ]) as ViewStyle
                }
              >
                <View style={style.flatten(["items-center"]) as ViewStyle}>
                  {keychainStore.biometryType === "FaceID" ||
                  (Platform.OS === "ios" &&
                    keychainStore.biometryType !== "TouchID") ? (
                    <FaceDetectIcon color={"#151a1a"} />
                  ) : (
                    <FingerprintIcon color={"#151a1a"} />
                  )}
                </View>
                <Button
                  textStyle={style.flatten(["color-dark", "h5"]) as ViewStyle}
                  text={
                    keychainStore.biometryType === "FaceID"
                      ? "Use Face ID"
                      : keychainStore.biometryType === "TouchID"
                      ? "Use Touch ID"
                      : Platform.OS === "ios"
                      ? "Use Face ID"
                      : "Use Biometric Authentication"
                  }
                  mode="text"
                  loading={isBiometricLoading}
                  showLoadingSpinner={true}
                  loaderColor={style.get("color-dark").color}
                />
              </View>
            </TouchableOpacity>
          ) : null}
        </KeyboardAwareScrollView>
      </View>
    </React.Fragment>
  );
});
