/* eslint-disable @typescript-eslint/no-var-requires */
const base = require("./jest.config");

module.exports = {
  ...base,
  testEnvironment: "<rootDir>/jest.jsdom.environment.cjs",
  testPathIgnorePatterns: ["/node_modules/"],
  testEnvironmentOptions: {
    // Non-opaque origin is required to keep localStorage/sessionStorage accessible in jsdom.
    url: "http://localhost/",
  },
};
