module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.cjs"],
  moduleNameMapper: {
    "^@keplr-wallet/background/cardano-chain-policy$":
      "<rootDir>/../background/src/keyring/cardano-chain-policy.ts",
    "\\.(css|scss|sass)$": "identity-obj-proxy",
    "\\.(svg|png|jpg|jpeg|gif)$": "<rootDir>/jest.fileMock.js",
    "^@layouts-v2/(.*)$": "<rootDir>/src/layouts-v2/$1",
    "^@utils/(.*)$": "<rootDir>/src/utils/$1",
    "^@components-v2/(.*)$": "<rootDir>/src/components-v2/$1",
    "^@components/(.*)$": "<rootDir>/src/components/$1",
    "^@assets/(.*)$": "<rootDir>/src/public/assets/$1",
    "^@graphQL/(.*)$": "<rootDir>/src/graphQL/$1",
  },
  testMatch: ["**/src/**/?(*.)+(spec|test).[jt]s?(x)"],
};
