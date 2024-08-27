import React, { FunctionComponent } from "react";
import { StoreProvider } from "./stores";
import { StyleProvider } from "./styles";
import { IntlProvider } from "react-intl";
import { Platform, StatusBar, View } from "react-native";

import codePush from "react-native-code-push";
import { InteractionModalsProvider } from "providers/interaction-modals-provider";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LoadingScreenProvider } from "providers/loading-screen";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Toast, { BaseToast, ErrorToast } from "react-native-toast-message";
import { BaseToastProps } from "react-native-toast-message/lib/src/types";
import { AppNavigation } from "navigation/navigation";
import { XmarkIcon } from "components/new/icon/xmark";

if (Platform.OS === "android") {
  // https://github.com/web-ridge/react-native-paper-dates/releases/tag/v0.2.15

  // Even though React Native supports the intl on android with "org.webkit:android-jsc-intl:+" option,
  // it seems that android doesn't support all intl API and this bothers me.
  // So, to reduce this problem on android, just use the javascript polyfill for intl.
  require("@formatjs/intl-getcanonicallocales/polyfill");
  require("@formatjs/intl-locale/polyfill");

  require("@formatjs/intl-pluralrules/polyfill");
  require("@formatjs/intl-pluralrules/locale-data/en.js");

  require("@formatjs/intl-displaynames/polyfill");
  require("@formatjs/intl-displaynames/locale-data/en.js");

  // require("@formatjs/intl-listformat/polyfill");
  // require("@formatjs/intl-listformat/locale-data/en.js");

  require("@formatjs/intl-numberformat/polyfill");
  require("@formatjs/intl-numberformat/locale-data/en.js");

  require("@formatjs/intl-relativetimeformat/polyfill");
  require("@formatjs/intl-relativetimeformat/locale-data/en.js");

  require("@formatjs/intl-datetimeformat/polyfill");
  require("@formatjs/intl-datetimeformat/locale-data/en.js");

  require("@formatjs/intl-datetimeformat/add-golden-tz.js");

  // https://formatjs.io/docs/polyfills/intl-datetimeformat/#default-timezone
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // const RNLocalize = require("react-native-localize");
  // if ("__setDefaultTimeZone" in Intl.DateTimeFormat) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // Intl.DateTimeFormat.__setDefaultTimeZone(RNLocalize.getTimeZone());
  // }
  // On android, setting the timezone makes that the hour in date looks weird if the hour exceeds 24. Ex) 00:10 AM -> 24:10 AM.
  // Disable the timezone until finding the solution.
}

// Prevent native splash screen from autohiding.
// UnlockScreen will hide the splash screen
SplashScreen.preventAutoHideAsync()
  .then((result) =>
    console.log(`SplashScreen.preventAutoHideAsync() succeeded: ${result}`)
  )
  .catch(console.warn);

const ThemeStatusBar: FunctionComponent = () => {
  return (
    <StatusBar
      translucent={true}
      backgroundColor="#ffffff00"
      barStyle={"light-content"}
    />
  );
};

const toastConfig = {
  /*
    Overwrite 'success' type,
    by modifying the existing `BaseToast` component
  */
  success: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      text1NumberOfLines={2}
      text2NumberOfLines={2}
      style={{ borderLeftColor: "#69C779" }}
      renderTrailingIcon={() => (
        <View
          style={{
            justifyContent: "center",
            alignItems: "center",
            marginHorizontal: 12,
          }}
        >
          <XmarkIcon color={"black"} />
        </View>
      )}
      onPress={Toast.hide}
    />
  ),
  /*
    Overwrite 'error' type,
    by modifying the existing `ErrorToast` component
  */
  error: (props: BaseToastProps) => (
    <ErrorToast
      {...props}
      text1NumberOfLines={2}
      text2NumberOfLines={2}
      renderTrailingIcon={() => (
        <View
          style={{
            justifyContent: "center",
            alignItems: "center",
            marginHorizontal: 12,
          }}
        >
          <XmarkIcon color={"black"} />
        </View>
      )}
      onPress={Toast.hide}
    />
  ),
};

const AppBody: FunctionComponent = () => {
  return (
    <React.Fragment>
      <StyleProvider>
        <StoreProvider>
          <IntlProvider
            locale="en"
            formats={{
              date: {
                en: {
                  // Prefer not showing the year.
                  // If the year is different with current time, recommend to show the year.
                  // However, this recomendation should be handled in the component logic.
                  // year: "numeric",
                  month: "short",
                  day: "2-digit",
                  hour: "2-digit",
                  hour12: false,
                  minute: "2-digit",
                  timeZoneName: "short",
                },
              },
            }}
          >
            <ThemeStatusBar />
            <SafeAreaProvider>
              <LoadingScreenProvider>
                <InteractionModalsProvider>
                  <AppNavigation />
                </InteractionModalsProvider>
              </LoadingScreenProvider>
            </SafeAreaProvider>
          </IntlProvider>
        </StoreProvider>
      </StyleProvider>
      <Toast config={toastConfig} />
    </React.Fragment>
  );
};

const CodePushAppBody: FunctionComponent = __DEV__
  ? AppBody
  : codePush(AppBody);

export const App: FunctionComponent = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CodePushAppBody />
    </GestureHandlerRootView>
  );
};
