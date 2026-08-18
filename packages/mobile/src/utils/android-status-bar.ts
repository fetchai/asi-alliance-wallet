import { Platform, StatusBar } from "react-native";

/**
 * expo-camera / CameraView on Android can leave the status-bar / notch region
 * black (opaque) after unmount. Match ThemeStatusBar in app.tsx.
 * No-op on iOS.
 */
export function restoreAndroidStatusBarAfterCamera(): void {
  if (Platform.OS !== "android") {
    return;
  }

  StatusBar.setTranslucent(true);
  StatusBar.setBackgroundColor("#ffffff00");
  StatusBar.setBarStyle("dark-content");
}
