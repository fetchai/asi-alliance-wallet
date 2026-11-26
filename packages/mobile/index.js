/**
 * @format
 */

import "./shim";

import "text-encoding";

import "react-native-gesture-handler";

import "react-native-url-polyfill/auto";

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
export const routingInstrumentation =
  new Sentry.ReactNavigationInstrumentation();

Sentry.init({
  dsn: process.env["SENTRY_DSN"] || "",
  integrations: [
    new Sentry.ReactNativeTracing({
      routingInstrumentation,
    }),
  ],
  // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
  // We recommend adjusting this value in production.
  tracesSampleRate: 1.0,
  _experiments: {
    // profilesSampleRate is relative to tracesSampleRate.
    // Here, we'll capture profiles for 100% of transactions.
    profilesSampleRate: 1.0,
  },
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
