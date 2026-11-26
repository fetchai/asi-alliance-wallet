#!/bin/sh

# Expo 51 used custom SplashScreenView / NativeResourcesBasedSplashScreenViewProvider
# copies to show a full-bleed background image and avoid a white flash.
# Expo 52's expo-splash-screen no longer ships those types (AndroidX SplashScreen path).
# Copying the old Kotlin files breaks compilation — remove them if present.
#
# App-level Theme.App.SplashScreen + res/drawable/splashscreen* handle splash visuals.
#
# Must be POSIX-safe: package.json runs postinstall with `sh`, which sources this file.

DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"

# Sourced from exec.sh → $0 is postinstall/exec.sh → ../../node_modules
# Run directly from android/ → ../../../node_modules
if [ -d "$DIR/../../node_modules/expo-splash-screen/android/src/main/java/expo/modules/splashscreen" ]; then
  SPLASH_JAVA="$DIR/../../node_modules/expo-splash-screen/android/src/main/java/expo/modules/splashscreen"
elif [ -d "$DIR/../../../node_modules/expo-splash-screen/android/src/main/java/expo/modules/splashscreen" ]; then
  SPLASH_JAVA="$DIR/../../../node_modules/expo-splash-screen/android/src/main/java/expo/modules/splashscreen"
else
  echo "Android Warning: expo-splash-screen android sources not found; skipped splash cleanup."
  exit 0
fi

rm -f "$SPLASH_JAVA/SplashScreenView.kt"
rm -f "$SPLASH_JAVA/NativeResourcesBasedSplashScreenViewProvider.kt"

echo "expo-splash-screen: ensured Expo 52 stock sources (no Expo 51 Kotlin overlays)."
