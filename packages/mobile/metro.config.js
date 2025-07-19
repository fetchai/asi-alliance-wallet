const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { getSentryExpoConfig, withSentryConfig} = require('@sentry/react-native/metro');

const exclusionList = require("metro-config/src/defaults/exclusionList");

const getWorkspaces = require("get-yarn-workspaces");
const path = require("path");


const defaultConfig = getDefaultConfig(__dirname);
const {
  resolver: { sourceExts, assetExts },
} = getSentryExpoConfig(__dirname);

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
  watchFolders,
  resolver: {
    // For react-native-svg-transformer
    assetExts: assetExts.filter((ext) => ext !== "svg"),
    sourceExts: [...sourceExts, 'svg'],
    // To prevent that multiple react instances exist,
    // add the react in this package to the blacklist,
    // and use the only react in the root project.
    blockList: exclusionList([/packages\/mobile\/node_modules\/react\/.*/]),
    extraNodeModules: {
      crypto: path.resolve(
          __dirname,
          './node_modules/expo-standard-web-crypto',
      ),
      'node:crypto': path.resolve(
          __dirname,
          './node_modules/expo-standard-web-crypto',
      ),
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
