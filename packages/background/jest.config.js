module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
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
    "^@keplr-wallet/cardano$": "<rootDir>/jest.cardano.mock.ts",
    "^@fetchai/wallet-types$": "<rootDir>/../wallet-types/src",
    "^@keplr-wallet/proto-types/(.*)$":
      "<rootDir>/../../wallet-api-example/src/proto-types-gen/src/$1",
    "^@keplr-wallet/proto-types$":
      "<rootDir>/../../wallet-api-example/src/proto-types-gen/src",
    "^@keplr-wallet/([^/]+)$": "<rootDir>/../$1/src",
  },
  testMatch: ["**/src/**/?(*.)+(spec|test).[jt]s?(x)"],
};
