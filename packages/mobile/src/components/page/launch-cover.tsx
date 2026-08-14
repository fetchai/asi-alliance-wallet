import React, { FunctionComponent, useEffect } from "react";
import {
  Image,
  InteractionManager,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { observer } from "mobx-react-lite";
import * as SplashScreen from "expo-splash-screen";
import { KeyRingStatus } from "@keplr-wallet/background";
import { useStore } from "stores/index";

let splashHidden = false;
// Android LaunchCover is mounted over Unlock; assume visible until it hides
// so auto-biometrics do not fire under the cover.
let launchCoverVisible = Platform.OS === "android";
const launchCoverListeners = new Set<() => void>();

export function isLaunchCoverVisible() {
  return launchCoverVisible;
}

export function onLaunchCoverHidden(listener: () => void) {
  if (!launchCoverVisible) {
    listener();
    return () => {};
  }
  launchCoverListeners.add(listener);
  return () => {
    launchCoverListeners.delete(listener);
  };
}

function setLaunchCoverVisible(next: boolean) {
  launchCoverVisible = next;
  if (!next) {
    launchCoverListeners.forEach((listener) => listener());
    launchCoverListeners.clear();
  }
}

export async function hideNativeSplash() {
  if (splashHidden) {
    return;
  }
  try {
    await SplashScreen.hideAsync();
    splashHidden = true;
  } catch {
    // Native splash may already be gone.
  }
}

function hideNativeSplashAfterPaint() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void hideNativeSplash();
    });
  });
}

/**
 * Logo overlay only, no store/navigation. Must paint on the first RN frame
 * so native splash does not dismiss onto a blank white root.
 */
export const LaunchCoverView: FunctionComponent = () => {
  useEffect(() => {
    setLaunchCoverVisible(true);
    return () => setLaunchCoverVisible(false);
  }, []);

  return (
    <View pointerEvents="none" style={styles.cover}>
      <Image
        source={require("assets/logo/logo-black.png")}
        style={styles.logo}
        resizeMode="contain"
        fadeDuration={0}
        onLoadEnd={hideNativeSplashAfterPaint}
      />
    </View>
  );
};

/** Dismisses the launch cover after keyring is ready. Render inside StoreProvider. */
export const LaunchCoverController: FunctionComponent<{
  onDismiss: () => void;
}> = observer(({ onDismiss }) => {
  const { keyRingStore } = useStore();

  useEffect(() => {
    if (keyRingStore.status === KeyRingStatus.NOTLOADED) {
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => {
      onDismiss();
    });
    return () => task.cancel();
  }, [keyRingStore.status, onDismiss]);

  return null;
});

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
    elevation: 999,
  },
  logo: {
    width: 219,
    height: 49,
  },
});
