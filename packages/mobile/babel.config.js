module.exports = {
  presets: ["module:@react-native/babel-preset"],
  plugins: [
    "react-native-reanimated/plugin",
    "@babel/plugin-transform-flow-strip-types",
    ["@babel/plugin-proposal-decorators", { legacy: true }],
    ["@babel/plugin-proposal-class-properties", { loose: true }],
    ["@babel/plugin-proposal-private-methods", { loose: true }],
    [
      "module-resolver",
      {
        root: ["./src"],
        alias: {
          components: "./src/components",
          navigation: "./src/navigation",
          screens: "./src/screens",
          hooks: "./src/hooks",
          assets: "./src/assets",
          styles: "./src/styles",
          modals: "./src/modals",
          providers: "./src/providers",
          stores: "./src/stores",
          utils: "./src/utils",
        },
      },
    ],
    [
      "transform-inline-environment-variables",
      {
        include: [
          "SENTRY_AUTH_TOKEN",
          "SENTRY_URL",
          "SENTRY_ORG",
          "SENTRY_PROJECT",
          "SENTRY_DSN",
          "PROD_AMPLITUDE_API_KEY",
          "DEV_AMPLITUDE_API_KEY",
          "PROD_AUTH_CLIENT_ID",
          "DEV_AUTH_CLIENT_ID",
        ],
      },
    ],
    [
      "module:react-native-dotenv",
      {
        moduleName: "@env",
        path: ".env",
        blacklist: null,
        whitelist: null,
        safe: false,
        allowUndefined: true,
      },
    ],
  ],
};
