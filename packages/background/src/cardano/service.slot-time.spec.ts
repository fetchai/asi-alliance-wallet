/**
 * Slot → wall-clock mapping and hydrated-tx timestamp wiring for CardanoService.
 * Kept separate from service.security.spec.ts (draft/minimum-violation contracts).
 */
import { CardanoService } from "./service";
// eslint-disable-next-line import/no-extraneous-dependencies
import { of } from "rxjs";

const createSlotTimeCalcMock = jest.fn();

jest.mock("@keplr-wallet/cardano", () => {
  const sendMinimum = jest.requireActual(
    "../../../cardano/src/utils/send-minimum-violation"
  );
  const cardanoConstants = jest.requireActual(
    "../../../cardano/src/constants/cardano-send-conflict"
  );
  return {
    CardanoKeyRing: class {},
    CardanoWalletManager: class {},
    createSlotTimeCalc: (...args: unknown[]) => createSlotTimeCalcMock(...args),
    createObservableTransactionsByAddressesProvider: jest.fn(),
    createTxHistoryLoader: jest.fn(),
    parseAssetId: jest.fn((assetId: string) => ({
      policyId: assetId.slice(0, 56),
      assetName: assetId.slice(56),
    })),
    getTxInputsValueAndAddress: jest.fn(async () => {
      throw new Error("input_resolution_failed");
    }),
    mapCardanoMinimumViolation: jest.fn(
      ({
        minimumOutputLovelace,
        coinMissingLovelace,
      }: {
        minimumOutputLovelace: string;
        coinMissingLovelace?: string;
      }) =>
        /^\d+$/.test(minimumOutputLovelace) &&
        BigInt(minimumOutputLovelace) > BigInt(0)
          ? {
              classification: "minimum_violation" as const,
              minimumOutputLovelace,
              coinMissingLovelace:
                coinMissingLovelace && /^\d+$/.test(coinMissingLovelace)
                  ? coinMissingLovelace
                  : undefined,
            }
          : null
    ),
    formatLegacyMinimumViolationLovelaceError: jest.fn(
      ({ violation }: { violation: { minimumOutputLovelace: string } }) =>
        `Amount too small: minimum output value is ${violation.minimumOutputLovelace} lovelace (protocol minimum for this output). Please send at least ${violation.minimumOutputLovelace} lovelace.`
    ),
    cardanoMalformedMinimumPayloadError:
      sendMinimum.cardanoMalformedMinimumPayloadError,
    CARDANO_MINIMUM_VIOLATION_MALFORMED_PAYLOAD:
      sendMinimum.CARDANO_MINIMUM_VIOLATION_MALFORMED_PAYLOAD,
    CARDANO_SEND_CONFLICT_PENDING_MESSAGE:
      cardanoConstants.CARDANO_SEND_CONFLICT_PENDING_MESSAGE,
  };
});

describe("CardanoService slot → timestamp", () => {
  const slotToMs = (slot: number, chainKey: string) =>
    (CardanoService as any).slotToTimestampMs(slot, chainKey) as
      | number
      | undefined;

  beforeEach(() => {
    createSlotTimeCalcMock.mockReset();
    (CardanoService as any).warnedUnknownSlotTimeChainKeys?.clear();
  });

  it("Preview: slot 108900309 — old wrong base vs fixed base differs by 3542400s", () => {
    const slot = 108_900_309;
    const wrongBase = 1_663_113_600;
    const rightBase = 1_666_656_000;
    expect(rightBase - wrongBase).toBe(3_542_400);
    expect(wrongBase + slot).toBe(1_772_013_909);
    expect(rightBase + slot).toBe(1_775_556_309);
    expect(slotToMs(slot, "cardano-preview")).toBe((rightBase + slot) * 1000);
  });

  it("Preprod fallback math remains explicit and deterministic", () => {
    expect(slotToMs(100, "cardano-preprod")).toBe((1_654_041_600 + 100) * 1000);
  });

  it("mainnet: first Shelley slot maps to fork unix", () => {
    expect(slotToMs(4_492_800, "cardano-mainnet")).toBe(1_596_059_091 * 1000);
  });

  it("unknown chainKey returns undefined and logs warn once per chainKey", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(slotToMs(1, "cardano-fantasy")).toBeUndefined();
    expect(slotToMs(2, "cardano-fantasy")).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("transformHydratedTxsToItems attaches corrected Preview timestamp", async () => {
    const service = new CardanoService();
    const wallet = {
      addresses$: of([{ address: "addr_test1self" }]),
      assetInfo$: of(new Map()),
    } as any;
    const txs = [
      {
        id: "tx_preview_slot",
        blockHeader: { slot: 108_900_309, blockNo: 4_171_445 },
        body: {
          fee: { coins: "170000" },
          outputs: [
            { address: "addr_test1self", value: { coins: "50000000" } },
          ],
          inputs: [],
        },
      },
    ];
    const items = await (service as any).transformHydratedTxsToItems(
      txs,
      wallet,
      {},
      "cardano-preview"
    );
    expect(items[0].timestamp).toBe((1_666_656_000 + 108_900_309) * 1000);
  });

  it("transformHydratedTxsToItems preprod fixture keeps source evidence and expected UTC timestamp", async () => {
    const service = new CardanoService();
    const fixture = {
      evidence: {
        chainKey: "cardano-preprod",
        source: "explorer parity reference",
        txId: "a7599e25b9ecf8f4f110c4d9197db770abbbacef27781269180f2b3aae200103",
        rawBlockHeader: { slot: 120_985_372, blockNo: 4_626_218 },
        slot: 120_985_372,
        expectedUtc: "2026-04-20T07:02:52.000Z",
      },
      tx: {
        id: "a7599e25b9ecf8f4f110c4d9197db770abbbacef27781269180f2b3aae200103",
        blockHeader: { slot: 120_985_372, blockNo: 4_626_218 },
        body: {
          fee: { coins: "170000" },
          outputs: [{ address: "addr_test1self", value: { coins: "170000" } }],
          inputs: [],
        },
      },
    };
    const wallet = {
      addresses$: of([{ address: "addr_test1self" }]),
      assetInfo$: of(new Map()),
    } as any;
    const items = await (service as any).transformHydratedTxsToItems(
      [fixture.tx],
      wallet,
      {},
      fixture.evidence.chainKey
    );
    expect(items).toHaveLength(1);
    expect(items[0].slot).toBe(fixture.evidence.slot);
    expect(items[0].timestamp).toBe(Date.parse(fixture.evidence.expectedUtc));
    expect(new Date(items[0].timestamp ?? 0).toISOString()).toBe(
      fixture.evidence.expectedUtc
    );
  });

  it("uses era summary slot calculator as primary path when available", async () => {
    const service = new CardanoService();
    createSlotTimeCalcMock.mockReturnValue((slot: number) => {
      // Deterministic synthetic timestamp for assertion.
      return new Date((2_000_000_000 + slot) * 1000);
    });
    const wallet = {
      addresses$: of([{ address: "addr_test1self" }]),
      assetInfo$: of(new Map()),
      eraSummaries$: of([{ parameters: {} }]),
    } as any;
    const txs = [
      {
        id: "tx_era_slot",
        blockHeader: { slot: 42, blockNo: 10 },
        body: {
          fee: { coins: "10" },
          outputs: [{ address: "addr_test1self", value: { coins: "10" } }],
          inputs: [],
        },
      },
    ];
    const items = await (service as any).transformHydratedTxsToItems(
      txs,
      wallet,
      {},
      "cardano-preprod"
    );
    expect(createSlotTimeCalcMock).toHaveBeenCalledTimes(1);
    expect(items[0].timestamp).toBe((2_000_000_000 + 42) * 1000);
  });

  it("uses era summary slot calculator even when tx has direct timestamp-like field", async () => {
    const service = new CardanoService();
    createSlotTimeCalcMock.mockReturnValue((slot: number) => {
      return new Date((2_100_000_000 + slot) * 1000);
    });
    const wallet = {
      addresses$: of([{ address: "addr_test1self" }]),
      assetInfo$: of(new Map()),
      eraSummaries$: of([{ parameters: {} }]),
    } as any;
    const txs = [
      {
        id: "tx_era_precedence",
        blockHeader: {
          slot: 7,
          blockNo: 99,
          // Direct timestamp-like field should not override era-summary primary path.
          timestamp: "1999-01-01T00:00:00.000Z",
        },
        body: {
          fee: { coins: "10" },
          outputs: [{ address: "addr_test1self", value: { coins: "10" } }],
          inputs: [],
        },
      },
    ];
    const items = await (service as any).transformHydratedTxsToItems(
      txs,
      wallet,
      {},
      "cardano-preprod"
    );
    expect(items[0].timestamp).toBe((2_100_000_000 + 7) * 1000);
    expect(items[0].timestamp).not.toBe(Date.parse("1999-01-01T00:00:00.000Z"));
  });

  it("transformHydratedTxsToItems omits timestamp when slot is non-finite after Number()", async () => {
    const service = new CardanoService();
    const wallet = {
      addresses$: of([{ address: "addr_test1self" }]),
      assetInfo$: of(new Map()),
    } as any;
    const txs = [
      {
        id: "tx_bad_slot",
        blockHeader: { slot: "not-a-slot", blockNo: 1 },
        body: {
          fee: { coins: "10" },
          outputs: [{ address: "addr_test1self", value: { coins: "100" } }],
          inputs: [],
        },
      },
    ];
    const items = await (service as any).transformHydratedTxsToItems(
      txs,
      wallet,
      {},
      "cardano-preview"
    );
    expect(items[0].slot).toBeUndefined();
    expect(items[0].timestamp).toBeUndefined();
  });
});
