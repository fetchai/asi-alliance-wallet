import {
  buildFetchedAddressesById,
  createWalletPickerCacheMergeOperation,
  isValidListAccountsForWalletPicker,
  mergeWalletPickerCacheSnapshot,
  walletPickerWalletIdsKeyFingerprint,
} from "./wallet-picker-address-sync";

const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

afterAll(() => {
  warnSpy.mockRestore();
});

describe("walletPickerWalletIdsKeyFingerprint", () => {
  it("is stable for a given key", () => {
    expect(walletPickerWalletIdsKeyFingerprint("a,b")).toBe(
      walletPickerWalletIdsKeyFingerprint("a,b")
    );
  });

  it("differs for different keys", () => {
    expect(walletPickerWalletIdsKeyFingerprint("a")).not.toBe(
      walletPickerWalletIdsKeyFingerprint("b")
    );
  });
});

describe("isValidListAccountsForWalletPicker", () => {
  const ctx = {
    chainId: "c1",
    walletIdsKeyFingerprint: "fp",
    walletIdsCount: 2,
  };

  it("returns false and logs when account length mismatches snapshot", () => {
    warnSpy.mockClear();
    const snapshot = ["a", "b"];
    const ok = isValidListAccountsForWalletPicker(
      [{ bech32Address: "x", EVMAddress: "" } as any],
      snapshot,
      ctx
    );
    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns true when lengths match and rows look valid", () => {
    const accts = [
      { bech32Address: "f1", EVMAddress: "" },
      { bech32Address: "f2", EVMAddress: "" },
    ] as any[];
    const snapshot = ["w1", "w2"];
    const ok = isValidListAccountsForWalletPicker(accts, snapshot, ctx);
    expect(ok).toBe(true);
  });

  it("rejects invalid bech32Address shape", () => {
    warnSpy.mockClear();
    const ok = isValidListAccountsForWalletPicker(
      [{ bech32Address: null, EVMAddress: "" }] as any,
      ["w1"],
      ctx
    );
    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("when isEvm, requires EVMAddress string", () => {
    warnSpy.mockClear();
    const ok = isValidListAccountsForWalletPicker(
      [{ bech32Address: "f1", EVMAddress: undefined }] as any,
      ["w1"],
      ctx,
      { isEvm: true }
    );
    expect(ok).toBe(false);
  });
});

describe("buildFetchedAddressesById", () => {
  it("maps bech32 for non-EVM", () => {
    const m = buildFetchedAddressesById({
      snapshotWalletIds: ["id0"],
      accounts: [{ bech32Address: "fetch1x", EVMAddress: "0xabc" } as any],
      isEvm: false,
    });
    expect(m).toEqual({ id0: "fetch1x" });
  });

  it("maps EVMAddress for EVM chain", () => {
    const m = buildFetchedAddressesById({
      snapshotWalletIds: ["id0"],
      accounts: [{ bech32Address: "fetch1x", EVMAddress: "0xabc" } as any],
      isEvm: true,
    });
    expect(m).toEqual({ id0: "0xabc" });
  });
});

describe("mergeWalletPickerCacheSnapshot", () => {
  it("merges fetched ids into normalized cache", () => {
    const next = mergeWalletPickerCacheSnapshot({
      existingCache: { old: "x" },
      snapshotWalletIds: ["w1"],
      fetchedById: { w1: "fetch1new" },
    });
    expect(next["w1"]).toBe("fetch1new");
  });
});

describe("createWalletPickerCacheMergeOperation", () => {
  it("returns currentCache unchanged when canCommit is false (stale — no merge)", () => {
    const op = createWalletPickerCacheMergeOperation({
      canCommit: () => false,
      snapshotWalletIds: ["w1"],
      fetchedById: { w1: "newaddr" },
    });
    const current = { w1: "old" };
    const { newCache } = op(current);
    expect(newCache).toBe(current);
    expect(newCache["w1"]).toBe("old");
  });

  it("merges when canCommit is true", () => {
    const op = createWalletPickerCacheMergeOperation({
      canCommit: () => true,
      snapshotWalletIds: ["w1"],
      fetchedById: { w1: "merged" },
    });
    const { newCache } = op({ w1: "old" });
    expect(newCache["w1"]).toBe("merged");
  });
});
