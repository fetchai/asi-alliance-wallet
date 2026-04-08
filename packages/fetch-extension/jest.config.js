module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.cjs"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        diagnostics: false,
        isolatedModules: true,
      },
    ],
  },
  moduleNameMapper: {
    "^@keplr-wallet/background/cardano-chain-policy$":
      "<rootDir>/../background/src/keyring/cardano-chain-policy.ts",
    "^@fetchai/wallet-types$": "<rootDir>/../wallet-types/src",
    "^@keplr-wallet/([^/]+)$": "<rootDir>/../$1/src",
    "\\.(css|scss|sass)$": "identity-obj-proxy",
    "\\.(svg|png|jpg|jpeg|gif)$": "<rootDir>/jest.fileMock.js",
    "^@layouts-v2/(.*)$": "<rootDir>/src/layouts-v2/$1",
    "^@utils/(.*)$": "<rootDir>/src/utils/$1",
    "^@components-v2/(.*)$": "<rootDir>/src/components-v2/$1",
    "^@components/(.*)$": "<rootDir>/src/components/$1",
    "^@assets/(.*)$": "<rootDir>/src/public/assets/$1",
    "^@graphQL/(.*)$": "<rootDir>/src/graphQL/$1",
  },
  testPathIgnorePatterns: [
    "/node_modules/",
    "/src/pages-new/send/send-phase-2.flow-ui.test.tsx$",
    "/src/pages-new/keyring-dev/set-key-ring-page.test.tsx$",
  ],
  testMatch: ["**/src/**/?(*.)+(spec|test).[jt]s?(x)"],
};
