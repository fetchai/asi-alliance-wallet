import {
  getBlockfrostConfigSource,
  isUsableProjectIdString,
  resolveBlockfrostConfig,
} from "./blockfrost-config-resolver";
import { getBlockfrostConfigs } from "./env-adapter";

describe("blockfrost-config-resolver", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["BLOCKFROST_PROJECT_ID_MAINNET"];
    delete process.env["BLOCKFROST_PROJECT_ID_PREPROD"];
    delete process.env["BLOCKFROST_PROJECT_ID_PREVIEW"];
    delete process.env["BLOCKFROST_PROJECT_ID_SANCHONET"];
    delete process.env["BLOCKFROST_API_KEY"];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("isUsableProjectIdString rejects empty and placeholder values", () => {
    expect(isUsableProjectIdString("")).toBe(false);
    expect(isUsableProjectIdString("   ")).toBe(false);
    expect(isUsableProjectIdString("<API_KEY>")).toBe(false);
    expect(isUsableProjectIdString(" <API_KEY> ")).toBe(false);
    expect(isUsableProjectIdString(" undefined ")).toBe(false);
    expect(isUsableProjectIdString("mainnet-project-id")).toBe(true);
  });

  it("resolveBlockfrostConfig does not return custom config for blank projectId", () => {
    process.env["BLOCKFROST_PROJECT_ID_PREPROD"] = "builtin-preprod-key";

    expect(
      resolveBlockfrostConfig("preprod", {
        useCustomKey: true,
        projectId: " ",
      })
    ).toEqual({
      baseUrl: getBlockfrostConfigs().preprod.baseUrl,
      projectId: "builtin-preprod-key",
    });
  });

  it("resolveBlockfrostConfig returns built-in when no custom prefs", () => {
    process.env["BLOCKFROST_PROJECT_ID_PREPROD"] = "builtin-preprod-key";

    expect(resolveBlockfrostConfig("preprod")).toEqual({
      baseUrl: getBlockfrostConfigs().preprod.baseUrl,
      projectId: "builtin-preprod-key",
    });
  });

  it("resolveBlockfrostConfig uses custom projectId with built-in baseUrl", () => {
    process.env["BLOCKFROST_PROJECT_ID_PREPROD"] = "builtin-preprod-key";

    expect(
      resolveBlockfrostConfig("preprod", {
        useCustomKey: true,
        projectId: " user-custom-key ",
      })
    ).toEqual({
      baseUrl: getBlockfrostConfigs().preprod.baseUrl,
      projectId: "user-custom-key",
    });
  });

  it("resolveBlockfrostConfig allows custom key when built-in projectId is missing", () => {
    expect(
      resolveBlockfrostConfig("preprod", {
        useCustomKey: true,
        projectId: "user-only-key",
      })
    ).toEqual({
      baseUrl: getBlockfrostConfigs().preprod.baseUrl,
      projectId: "user-only-key",
    });
    expect(resolveBlockfrostConfig("preprod")).toBeNull();
  });

  it("getBlockfrostConfigSource distinguishes builtin, custom, and none", () => {
    process.env["BLOCKFROST_PROJECT_ID_MAINNET"] = "builtin-mainnet";

    expect(getBlockfrostConfigSource("mainnet")).toBe("builtin");
    expect(
      getBlockfrostConfigSource("mainnet", {
        useCustomKey: true,
        projectId: "custom-mainnet",
      })
    ).toBe("custom");
    expect(getBlockfrostConfigSource("preview")).toBe("none");
  });
});
