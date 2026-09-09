import {
  applyRecoveryPaste,
  createEmptyRecoveryFields,
  getRecoveryFieldCount,
  looksLikePrivateKey,
  PRIVATE_KEY_INPUT_MAX_LENGTH,
  RecoverySeedType,
  resolveRecoveryPaste,
  submitRecoverySeed,
  validatePrivateKey,
  validateRecoverySeed,
} from "./recover-mnemonic-logic";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bip39 = require("bip39");

const PRIVATE_KEY_BYTES = Array.from({ length: 32 }, (_, index) => index);
const PRIVATE_KEY = PRIVATE_KEY_BYTES.map((byte) =>
  byte.toString(16).padStart(2, "0")
).join("");
const PREFIXED_PRIVATE_KEY = `0x${PRIVATE_KEY}`;
const MNEMONIC_12 = `${"abandon ".repeat(11)}about`;
const MNEMONIC_24 = `${"abandon ".repeat(23)}art`;
const MNEMONIC_15 = bip39.entropyToMnemonic("00".repeat(20));
const MNEMONIC_18 = bip39.entropyToMnemonic("00".repeat(24));
const MNEMONIC_21 = bip39.entropyToMnemonic("00".repeat(28));

describe("private-key recovery input", () => {
  it("accepts the two supported private-key formats without truncation", () => {
    expect(PRIVATE_KEY).toHaveLength(64);
    expect(PREFIXED_PRIVATE_KEY).toHaveLength(66);
    expect(PRIVATE_KEY_INPUT_MAX_LENGTH).toBe(66);
    expect(validatePrivateKey(PRIVATE_KEY)).toBe(true);
    expect(validatePrivateKey(PREFIXED_PRIVATE_KEY)).toBe(true);
  });

  it.each([63, 65, 67])(
    "rejects an unprefixed %i-character value",
    (length) => {
      expect(validatePrivateKey("a".repeat(length))).toBe(false);
    }
  );

  it("rejects non-hex input", () => {
    expect(validatePrivateKey(`${"a".repeat(63)}g`)).toBe(false);
  });

  it("recognizes a malformed 0x-prefixed value as a private-key candidate", () => {
    expect(looksLikePrivateKey("0x1234")).toBe(true);
    expect(validatePrivateKey("0x1234")).toBe(false);
  });

  it("keeps a pasted private key in exactly one field", () => {
    expect(
      applyRecoveryPaste(
        RecoverySeedType.PRIVATE_KEY,
        [""],
        0,
        `  ${PREFIXED_PRIVATE_KEY}  `
      )
    ).toEqual([PREFIXED_PRIVATE_KEY]);
  });

  it("keeps unrecognized spaced text in one private-key field", () => {
    const fields = applyRecoveryPaste(
      RecoverySeedType.PRIVATE_KEY,
      [""],
      0,
      "not a recognized recovery value"
    );

    expect(fields).toEqual(["not a recognized recovery value"]);
    expect(
      validateRecoverySeed(
        RecoverySeedType.PRIVATE_KEY,
        fields,
        bip39.validateMnemonic
      )
    ).toBe("__invalid__");
  });
});

describe("recovery mode transitions", () => {
  it("creates only fields compatible with the selected mode", () => {
    expect(createEmptyRecoveryFields(RecoverySeedType.PRIVATE_KEY)).toEqual([
      "",
    ]);
    expect(createEmptyRecoveryFields(RecoverySeedType.WORDS12)).toHaveLength(
      12
    );
    expect(createEmptyRecoveryFields(RecoverySeedType.WORDS24)).toHaveLength(
      24
    );
  });

  it.each([
    RecoverySeedType.WORDS12,
    RecoverySeedType.WORDS24,
    RecoverySeedType.PRIVATE_KEY,
  ])(
    "selects the 12-word mode for a valid phrase pasted from %s",
    (seedType) => {
      const result = resolveRecoveryPaste(
        seedType,
        createEmptyRecoveryFields(seedType),
        Math.min(3, getRecoveryFieldCount(seedType) - 1),
        `  ${MNEMONIC_12.replace(/ /g, " \n ")}  `,
        bip39.validateMnemonic
      );

      expect(result.seedType).toBe(RecoverySeedType.WORDS12);
      expect(result.seedWords).toHaveLength(12);
      expect(result.seedWords.join(" ")).toBe(MNEMONIC_12);
    }
  );

  it.each([
    [15, MNEMONIC_15],
    [18, MNEMONIC_18],
    [21, MNEMONIC_21],
  ])(
    "preserves a valid %i-word BIP39 phrase in the 24-word mode",
    (wordCount, mnemonic) => {
      const result = resolveRecoveryPaste(
        RecoverySeedType.WORDS12,
        createEmptyRecoveryFields(RecoverySeedType.WORDS12),
        0,
        mnemonic,
        bip39.validateMnemonic
      );

      expect(result.seedType).toBe(RecoverySeedType.WORDS24);
      expect(result.seedWords).toHaveLength(24);
      expect(result.seedWords.slice(0, wordCount).join(" ")).toBe(mnemonic);
      expect(
        result.seedWords.slice(wordCount).every((word) => word === "")
      ).toBe(true);
      expect(
        validateRecoverySeed(
          result.seedType,
          result.seedWords,
          bip39.validateMnemonic
        )
      ).toBeUndefined();
    }
  );

  it.each([
    RecoverySeedType.WORDS12,
    RecoverySeedType.WORDS24,
    RecoverySeedType.PRIVATE_KEY,
  ])(
    "selects the 24-word mode for a valid phrase pasted from %s",
    (seedType) => {
      const result = resolveRecoveryPaste(
        seedType,
        createEmptyRecoveryFields(seedType),
        Math.min(3, getRecoveryFieldCount(seedType) - 1),
        MNEMONIC_24,
        bip39.validateMnemonic
      );

      expect(result.seedType).toBe(RecoverySeedType.WORDS24);
      expect(result.seedWords).toHaveLength(24);
      expect(result.seedWords.join(" ")).toBe(MNEMONIC_24);
    }
  );

  it.each([
    RecoverySeedType.WORDS12,
    RecoverySeedType.WORDS24,
    RecoverySeedType.PRIVATE_KEY,
  ])(
    "selects the private-key mode for a valid key pasted from %s",
    (seedType) => {
      const result = resolveRecoveryPaste(
        seedType,
        createEmptyRecoveryFields(seedType),
        Math.min(3, getRecoveryFieldCount(seedType) - 1),
        `  ${PREFIXED_PRIVATE_KEY}  `,
        bip39.validateMnemonic
      );

      expect(result).toEqual({
        seedType: RecoverySeedType.PRIVATE_KEY,
        seedWords: [PREFIXED_PRIVATE_KEY],
      });
    }
  );

  it("keeps unrecognized pasted text in the currently selected mode", () => {
    const result = resolveRecoveryPaste(
      RecoverySeedType.WORDS12,
      createEmptyRecoveryFields(RecoverySeedType.WORDS12),
      2,
      "not a recognized recovery value",
      bip39.validateMnemonic
    );

    expect(result.seedType).toBe(RecoverySeedType.WORDS12);
    expect(result.seedWords.slice(2, 7)).toEqual([
      "not",
      "a",
      "recognized",
      "recovery",
      "value",
    ]);
  });

  it("does not switch modes for a 12-word value with an invalid checksum", () => {
    const invalidMnemonic = "abandon ".repeat(12).trim();
    const result = resolveRecoveryPaste(
      RecoverySeedType.PRIVATE_KEY,
      createEmptyRecoveryFields(RecoverySeedType.PRIVATE_KEY),
      0,
      invalidMnemonic,
      bip39.validateMnemonic
    );

    expect(result).toEqual({
      seedType: RecoverySeedType.PRIVATE_KEY,
      seedWords: [invalidMnemonic],
    });
  });

  it("expands an overflowing 12-word paste instead of truncating it", () => {
    const pastedValue = `${MNEMONIC_12} extra`;
    const result = resolveRecoveryPaste(
      RecoverySeedType.WORDS12,
      createEmptyRecoveryFields(RecoverySeedType.WORDS12),
      0,
      pastedValue,
      bip39.validateMnemonic
    );

    expect(result.seedType).toBe(RecoverySeedType.WORDS24);
    expect(result.seedWords).toHaveLength(24);
    expect(result.seedWords.slice(0, 13).join(" ")).toBe(pastedValue);
    expect(
      validateRecoverySeed(
        result.seedType,
        result.seedWords,
        bip39.validateMnemonic
      )
    ).toBe("__invalid__");
  });

  it("preserves overflow beyond 24 words so it cannot validate silently", () => {
    const pastedValue = `${MNEMONIC_24} extra words`;
    const result = resolveRecoveryPaste(
      RecoverySeedType.WORDS24,
      createEmptyRecoveryFields(RecoverySeedType.WORDS24),
      0,
      pastedValue,
      bip39.validateMnemonic
    );

    expect(result.seedWords).toHaveLength(24);
    expect(result.seedWords[23]).toBe("art extra words");
    expect(
      validateRecoverySeed(
        result.seedType,
        result.seedWords,
        bip39.validateMnemonic
      )
    ).toBe("__invalid__");
  });

  it("switches a malformed 0x-prefixed value to private-key validation", () => {
    const result = resolveRecoveryPaste(
      RecoverySeedType.WORDS12,
      createEmptyRecoveryFields(RecoverySeedType.WORDS12),
      0,
      "0x1234",
      bip39.validateMnemonic
    );

    expect(result).toEqual({
      seedType: RecoverySeedType.PRIVATE_KEY,
      seedWords: ["0x1234"],
    });
    expect(
      validateRecoverySeed(
        result.seedType,
        result.seedWords,
        bip39.validateMnemonic
      )
    ).toBe("__invalid__");
  });
});

describe("recovery submit routing", () => {
  it.each([PRIVATE_KEY, PREFIXED_PRIVATE_KEY])(
    "submits the exact 32 bytes represented by the private key",
    async (privateKey) => {
      const createPrivateKey = jest.fn().mockResolvedValue(undefined);
      const createMnemonic = jest.fn().mockResolvedValue(undefined);

      await expect(
        submitRecoverySeed({
          seedType: RecoverySeedType.PRIVATE_KEY,
          seedWords: [privateKey],
          createPrivateKey,
          createMnemonic,
        })
      ).resolves.toBe("privateKey");

      expect(createPrivateKey).toHaveBeenCalledTimes(1);
      expect(Array.from(createPrivateKey.mock.calls[0][0])).toEqual(
        PRIVATE_KEY_BYTES
      );
      expect(createMnemonic).not.toHaveBeenCalled();
    }
  );

  it("keeps mnemonic submit on createMnemonic", async () => {
    const createPrivateKey = jest.fn().mockResolvedValue(undefined);
    const createMnemonic = jest.fn().mockResolvedValue(undefined);

    await expect(
      submitRecoverySeed({
        seedType: RecoverySeedType.WORDS12,
        seedWords: MNEMONIC_12.split(" "),
        createPrivateKey,
        createMnemonic,
      })
    ).resolves.toBe("mnemonic");

    expect(createMnemonic).toHaveBeenCalledWith(MNEMONIC_12);
    expect(createPrivateKey).not.toHaveBeenCalled();
  });
});
