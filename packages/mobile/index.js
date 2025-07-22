/**
 * @format
 */

import "./shim";
import "react-native-gesture-handler";
import { AppRegistry, LogBox } from "react-native";

import "./init";
import * as Sentry from "@sentry/react-native";

// The use of "require" is intentional.
// In case of "import" statement, it is located before execution of the next line,
// so `getPlugin()` can be executed before `Bugsnag.start()`.
// To prevent this, "require" is used.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const App = require("./src/app").App;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appName = require("./app.json").name;

export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  dsn: process.env["SENTRY_DSN"] || "",
  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,
  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), navigationIntegration],
});

// eslint-disable-next-line import/no-default-export
export default Sentry.wrap(App);

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
