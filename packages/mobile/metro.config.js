/* eslint-disable */
const { getDefaultConfig } = require("expo/metro-config");
const { mergeConfig } = require("@react-native/metro-config");
const exclusionList = require("metro-config/src/defaults/exclusionList");
const getWorkspaces = require("get-yarn-workspaces");
const path = require("path");

// Expo 52: required so Metro can resolve `.expo/.virtual-metro-entry`
const defaultConfig = getDefaultConfig(__dirname);

const workspaces = getWorkspaces(__dirname);

// Add additional Yarn workspace package roots to the module map
// https://bit.ly/2LHHTP0
const watchFolders = [
  path.resolve(__dirname, "../..", "node_modules"),
  ...workspaces.filter((workspaceDir) => {
    return !(workspaceDir === __dirname);
  }),
];

const config = {
  projectRoot: path.resolve(__dirname, "."),
  watchFolders: [
    ...new Set([...(defaultConfig.watchFolders || []), ...watchFolders]),
  ],
  watcher: {
    // Explicitly define watcher to override any unstable/default options from Sentry/Metro.
    // This resolves the 'unstable_autoSaveCache' warning by using stable alternatives.
    healthCheck: {
      enabled: true,
      interval: 5000, // Similar to debounceMs – checks watcher health every 5s.
      timeout: 10000, // Adjust as needed.
    },
  },
  resolver: {
    // For react-native-svg-transformer
    assetExts: defaultConfig.resolver.assetExts.filter((ext) => ext !== "svg"),
    sourceExts: [...defaultConfig.resolver.sourceExts, "svg"],
    // To prevent multiple React instances, block the one in this package and use root's.
    blockList: exclusionList([/packages\/mobile\/node_modules\/react\/.*/]),
    extraNodeModules: {
      ...(defaultConfig.resolver.extraNodeModules || {}),
      crypto: path.resolve(
        __dirname,
        "./node_modules/expo-standard-web-crypto"
      ),
      "node:crypto": path.resolve(
        __dirname,
        "./node_modules/expo-standard-web-crypto"
      ),
      buffer: path.resolve(__dirname, "./node_modules/buffer"),
      stream: path.resolve(__dirname, "./node_modules/stream-browserify"),
      string_decoder: path.resolve(__dirname, "./node_modules/string_decoder"),
      path: path.resolve(__dirname, "./node_modules/path-browserify"),
      http: path.resolve(__dirname, "./node_modules/http-browserify"),
      https: path.resolve(__dirname, "./node_modules/https-browserify"),
      os: path.resolve(__dirname, "./node_modules/os-browserify"),
      zlib: require.resolve("empty-module"),
    },
  },
  transformer: {
    babelTransformerPath: require.resolve("react-native-svg-transformer"),
  },
};

module.exports = mergeConfig(defaultConfig, config);
