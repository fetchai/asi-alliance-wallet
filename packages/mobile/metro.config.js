const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { getSentryExpoConfig, withSentryConfig } = require('@sentry/react-native/metro');
const exclusionList = require("metro-config/src/defaults/exclusionList");
const getWorkspaces = require("get-yarn-workspaces");
const path = require("path");

const defaultConfig = getDefaultConfig(__dirname);
const {
  resolver: { sourceExts, assetExts },
} = getSentryExpoConfig(__dirname);

const workspaces = getWorkspaces(__dirname);

// Optimized watchFolders: Include root node_modules and only relevant workspaces.
// Filter out unnecessary ones to improve watcher performance (e.g., exclude test folders or non-RN workspaces if applicable).
// Adjust the filter as needed based on your monorepo structure.
const watchFolders = [
  path.resolve(__dirname, "../..", "node_modules"),
  ...workspaces.filter((workspaceDir) => {
    // Example: Only watch workspaces related to the RN app (customize this regex/filter).
    // This focuses more on the RN folder while keeping monorepo imports working.
    return !(workspaceDir === __dirname);
  }),
];

const config = {
  projectRoot: path.resolve(__dirname, "."),
  watchFolders,
  watcher: {
    // Explicitly define watcher to override any unstable/default options from Sentry/Metro.
    // This resolves the 'unstable_autoSaveCache' warning by using stable alternatives.
    // Enables Watchman for better performance in monorepos.
    useWatchman: true,
    healthCheck: {
      enabled: true,
      interval: 5000, // Similar to debounceMs – checks watcher health every 5s.
      timeout: 10000, // Adjust as needed.
    },
    // If you need auto-save cache behavior, use this stable workaround (not unstable).
    // unstable_autoSaveCache: undefined, // Uncomment to explicitly disable if still warned.
  },
  resolver: {
    // For react-native-svg-transformer
    assetExts: assetExts.filter((ext) => ext !== "svg"),
    sourceExts: [...sourceExts, 'svg'],
    // To prevent multiple React instances, block the one in this package and use root's.
    blockList: exclusionList([/packages\/mobile\/node_modules\/react\/.*/]),
    extraNodeModules: {
      crypto: path.resolve(__dirname, './node_modules/expo-standard-web-crypto'),
      'node:crypto': path.resolve(__dirname, './node_modules/expo-standard-web-crypto'),
      buffer: path.resolve(__dirname, './node_modules/buffer'),
      stream: path.resolve(__dirname, './node_modules/stream-browserify'),
      string_decoder: path.resolve(__dirname, './node_modules/string_decoder'),
      path: path.resolve(__dirname, './node_modules/path-browserify'),
      http: path.resolve(__dirname, './node_modules/http-browserify'),
      https: path.resolve(__dirname, './node_modules/https-browserify'),
      os: path.resolve(__dirname, './node_modules/os-browserify'),
      zlib: require.resolve("empty-module"),
    },
  },
  transformer: {
    babelTransformerPath: require.resolve("react-native-svg-transformer"),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = withSentryConfig(mergeConfig(defaultConfig, config));
