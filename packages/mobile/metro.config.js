/* eslint-disable */
const { getDefaultConfig } = require("expo/metro-config");
const { mergeConfig } = require("@react-native/metro-config");
const exclusionList = require("metro-config/src/defaults/exclusionList");
const getWorkspaces = require("get-yarn-workspaces");
const fs = require("fs");
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

/**
 * Metro doesn't honor package.json "exports" the same way Node does.
 * Newer @ledgerhq packages expose deep paths like:
 *   @ledgerhq/domain-service/signers/index
 * which map to lib/<subpath>.js. Resolve those explicitly.
 */
const resolveLedgerhqSubpath = (moduleName) => {
  const match = moduleName.match(/^(@ledgerhq\/[^/]+)\/(.+)$/);
  if (!match) {
    return null;
  }

  const [, pkg, subpath] = match;
  let pkgRoot;
  try {
    pkgRoot = path.dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    return null;
  }

  const candidates = [
    path.join(pkgRoot, "lib", `${subpath}.js`),
    path.join(pkgRoot, "lib", subpath, "index.js"),
    path.join(pkgRoot, `${subpath}.js`),
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return { filePath, type: "sourceFile" };
    }
  }

  return null;
};

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
    resolveRequest: (context, moduleName, platform) => {
      const ledgerResolved = resolveLedgerhqSubpath(moduleName);
      if (ledgerResolved) {
        return ledgerResolved;
      }

      // starknet's "browser" field points at index.global.js (IIFE). Metro prefers
      // that, but the IIFE never assigns module.exports, so require("starknet")
      // yields {} and `class X extends Account` throws Super expression errors.
      // Node's require.resolve uses exports.require → dist/index.js instead.
      if (moduleName === "starknet") {
        return {
          filePath: require.resolve("starknet", { paths: [__dirname] }),
          type: "sourceFile",
        };
      }

      return context.resolveRequest(context, moduleName, platform);
    },
  },
  transformer: {
    babelTransformerPath: require.resolve("react-native-svg-transformer"),
  },
};

module.exports = mergeConfig(defaultConfig, config);
