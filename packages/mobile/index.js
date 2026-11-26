/**
 * @format
 */

import "@web3auth/react-native-sdk/setup";
import "./shim";
import "react-native-gesture-handler";
import { AppRegistry, LogBox } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from "react-native-reanimated";

// Strict mode warns on SharedValue reads during render; we fixed the known
// AnimatedNumber path, but keep noise down if other libs still trip it.
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

// Expo 52: must run before other JS so splash is not dismissed on CONTENT_APPEARED.
SplashScreen.preventAutoHideAsync().catch(() => {});
try {
  SplashScreen.setOptions({ duration: 0, fade: false });
} catch {
  // Expo Go / old native splash module
}

import "./init";
import * as Sentry from "@sentry/react-native";
import { SENTRY_DSN } from "@env";

// The use of "require" is intentional.
// In case of "import" statement, it is located before execution of the next line,
// so `getPlugin()` can be executed before `Bugsnag.start()`.
// To prevent this, "require" is used.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const App = require("./src/app").App;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appName = require("./app.json").name;

export const navigationIntegration = SENTRY_DSN
  ? Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: true })
  : { registerNavigationContainer: () => {} };

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // Adds more context data to events (IP address, cookies, user, etc.)
    // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
    sendDefaultPii: true,
    // Configure Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.mobileReplayIntegration(), navigationIntegration],
  });
}

// eslint-disable-next-line import/no-default-export
export default SENTRY_DSN ? Sentry.wrap(App) : App;

LogBox.ignoreLogs([
  "No native splash screen registered for given view controller. Call 'SplashScreen.show' for given view controller first.",
  "Possible Unhandled Promise Rejection",
  "Non-serializable values were found in the navigation state",
  "Require cycle: ../stores/build/common/query/index.js -> ../stores/build/common/query/json-rpc.js -> ../stores/build/common/query/index.js",
  "Require cycle: ../hooks/build/tx/index.js",
  `new NativeEventEmitter()`,
  "invoking a computedFn from outside an reactive context won't be memoized, unless keepAlive is set",
]);
AppRegistry.registerComponent(appName, () => App);
