import {
  getNetworkConfig,
  logApiKeyStatus,
  logBlockfrostProviderStatus,
} from "./env-adapter";

describe("getNetworkConfig built-in env validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["BLOCKFROST_PROJECT_ID_PREPROD"];
    delete process.env["BLOCKFROST_API_KEY"];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("rejects whitespace-only built-in env projectId", () => {
    process.env["BLOCKFROST_PROJECT_ID_PREPROD"] = "   ";

    expect(getNetworkConfig("preprod")).toBeNull();
  });

  it("returns trimmed built-in env projectId", () => {
    process.env["BLOCKFROST_PROJECT_ID_PREPROD"] = "  builtin-preprod-key  ";

    expect(getNetworkConfig("preprod")).toEqual(
      expect.objectContaining({
        projectId: "builtin-preprod-key",
      })
    );
  });
});

describe("logBlockfrostProviderStatus", () => {
  const originalEnv = process.env;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["BLOCKFROST_PROJECT_ID_PREPROD"];
    delete process.env["BLOCKFROST_API_KEY"];
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("does not warn when provider is ready", () => {
    logBlockfrostProviderStatus("preprod", {
      providerReady: true,
      usesCustomResolver: true,
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns about provider unavailable when custom resolver is used", () => {
    logBlockfrostProviderStatus("preprod", {
      providerReady: false,
      usesCustomResolver: true,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "Blockfrost provider unavailable for preprod network - limited functionality"
    );
  });

  it("warns about missing built-in key when no custom resolver is used", () => {
    logBlockfrostProviderStatus("preprod", {
      providerReady: false,
      usesCustomResolver: false,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "Blockfrost API key not found for preprod network - limited functionality"
    );
  });
});

describe("logApiKeyStatus compatibility wrapper", () => {
  const originalEnv = process.env;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["BLOCKFROST_PROJECT_ID_PREPROD"];
    delete process.env["BLOCKFROST_API_KEY"];
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("warns when built-in env key is missing", () => {
    logApiKeyStatus("preprod");

    expect(warnSpy).toHaveBeenCalledWith(
      "Blockfrost API key not found for preprod network - limited functionality"
    );
  });

  it("does not warn when built-in env key is present", () => {
    process.env["BLOCKFROST_PROJECT_ID_PREPROD"] = "builtin-preprod-key";

    logApiKeyStatus("preprod");

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
