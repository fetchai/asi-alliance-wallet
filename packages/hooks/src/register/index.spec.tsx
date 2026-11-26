import { RegisterConfig } from "./index";

// Minimal KeyRingStore stub — RegisterConfig only needs the shape.
const createKeyRingStoreStub = (overrides: Record<string, unknown> = {}) => {
  return {
    keyInfos: [],
    newMnemonicKey: jest.fn(),
    newKeystoneKey: jest.fn(),
    newLedgerKey: jest.fn(),
    newPrivateKeyKey: jest.fn(async () => {
      // simulate successful vault creation
    }),
    ...overrides,
  };
};

const rngStub = <T extends ArrayBufferView | null>(array: T): Promise<T> =>
  Promise.resolve(array);

const createRegisterConfig = (
  keyRingStore: ReturnType<
    typeof createKeyRingStoreStub
  > = createKeyRingStoreStub()
) => {
  // Cast only at the RegisterConfig boundary — the store stub is intentionally
  // incomplete for this unit test.
  return new RegisterConfig(
    keyRingStore as unknown as ConstructorParameters<typeof RegisterConfig>[0],
    [],
    rngStub
  );
};

describe("RegisterConfig.clear()", () => {
  it("wipes the private key and email along with the type", () => {
    const config = createRegisterConfig();
    config.setType("privateKey");
    config.setPrivateKey("deadbeef".repeat(8));
    config.setEmail("user@example.com");

    config.clear();

    expect(config.type).toBe("");
    expect(config.privateKey).toBe("");
    expect(config.email).toBe("");
  });

  it("wipes the private key after createPrivateKey completes", async () => {
    const config = createRegisterConfig();
    config.setPrivateKey("deadbeef".repeat(8));
    config.setEmail("user@example.com");

    await config.createPrivateKey(
      "account-1",
      new Uint8Array(32),
      "password123",
      {}
    );

    expect(config.isFinalized).toBe(true);
    expect(config.privateKey).toBe("");
    expect(config.isLoading).toBe(false);
  });

  it("wipes the private key even when vault creation fails", async () => {
    const keyRingStore = createKeyRingStoreStub({
      newPrivateKeyKey: jest.fn(async () => {
        throw new Error("vault creation failed");
      }),
    });
    const config = createRegisterConfig(keyRingStore);
    config.setPrivateKey("deadbeef".repeat(8));

    await expect(
      config.createPrivateKey("account-1", new Uint8Array(32), "pw", {})
    ).rejects.toThrow("vault creation failed");

    expect(config.privateKey).toBe("");
    expect(config.isFinalized).toBe(false);
  });
});
