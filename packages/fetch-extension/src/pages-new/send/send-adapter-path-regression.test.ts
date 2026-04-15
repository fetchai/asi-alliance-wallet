jest.mock(
  "../../../../stores/src/query/cardano/token-balance-registry",
  () => ({
    CARDANO_NATIVE_TOKEN_TYPE: "native-token",
  })
);

const mockMapCardanoMinimumViolation = jest.fn(
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
);
const mockFormatCardanoMinimumViolationMessage = jest.fn(
  ({
    violation,
    cardanoDenom,
    nativeAdaCoinDecimals,
  }: {
    violation: { minimumOutputLovelace: string };
    cardanoDenom: string;
    nativeAdaCoinDecimals: number;
  }) => {
    const safe = violation.minimumOutputLovelace.replace(/^0+/, "") || "0";
    const padded = safe.padStart(nativeAdaCoinDecimals + 1, "0");
    const whole = padded.slice(0, -nativeAdaCoinDecimals);
    const frac = padded.slice(-nativeAdaCoinDecimals).replace(/0+$/, "");
    const minAda = frac ? `${whole}.${frac}` : whole;
    return `Amount too small. Minimum required is ${minAda} ${cardanoDenom}`;
  }
);

jest.mock("@keplr-wallet/cardano", () => {
  const { cardanoMalformedMinimumPayloadError } = jest.requireActual(
    "../../../../cardano/src/utils/send-minimum-violation"
  );
  return {
    mapCardanoMinimumViolation: mockMapCardanoMinimumViolation,
    formatCardanoMinimumViolationMessage:
      mockFormatCardanoMinimumViolationMessage,
    cardanoMalformedMinimumPayloadError,
  };
});

jest.mock("@keplr-wallet/background", () => {
  class BuildSendAdaTxDraftMsg {
    constructor(
      public readonly to: string,
      public readonly amount: string,
      public readonly memo?: string,
      public readonly chainId?: string,
      public readonly assets?: unknown[],
      public readonly allowZeroForMinimumCheck?: boolean
    ) {}
  }
  class SubmitSendAdaTxDraftMsg {
    constructor(
      public readonly draftId: string,
      public readonly chainId?: string
    ) {}
  }
  class SubmitSendAdaTxDraftWithPasswordMsg {
    constructor(
      public readonly draftId: string,
      public readonly password: string,
      public readonly chainId?: string
    ) {}
  }
  class DiscardSendAdaTxDraftMsg {
    constructor(public readonly draftId: string) {}
  }
  return {
    BuildSendAdaTxDraftMsg,
    SubmitSendAdaTxDraftMsg,
    SubmitSendAdaTxDraftWithPasswordMsg,
    DiscardSendAdaTxDraftMsg,
  };
});

import { CardanoSendAdapter } from "../../../../stores/src/cardano/send-adapter";

describe("CardanoSendAdapter regression path", () => {
  const currency = {
    coinDenom: "tADA",
    coinMinimalDenom: "ulovelace",
    coinDecimals: 6,
  } as any;

  beforeEach(() => {
    mockMapCardanoMinimumViolation.mockClear();
    mockFormatCardanoMinimumViolationMessage.mockClear();
  });

  it("simulate uses build-draft path, surfaces minimum_violation, and discards draft on success", async () => {
    const sendMessage = jest
      .fn()
      .mockResolvedValueOnce({
        kind: "minimum_violation",
        minimumOutputLovelace: "970000",
        coinMissingLovelace: "969999",
      })
      .mockResolvedValueOnce({
        kind: "draft",
        draftId: "d1",
        fee: "123",
        total: "1000",
      })
      .mockResolvedValueOnce(undefined);

    const adapter = new CardanoSendAdapter(
      { sendMessage } as any,
      "cardano-preview"
    );
    const tx = adapter.makeSendTokenTx(
      "0.0000001",
      currency,
      "addr_test1qrecipient"
    );
    expect(tx).toBeDefined();

    await expect(tx!.simulate()).rejects.toThrow(
      "Amount too small. Minimum required is 0.97 tADA"
    );
    const sim = await tx!.simulate();
    expect(sim.gasUsed).toBe(123);

    const firstBuild = sendMessage.mock.calls[0][1];
    expect(firstBuild.constructor.name).toBe("BuildSendAdaTxDraftMsg");
    expect(firstBuild.allowZeroForMinimumCheck).toBe(true);
    expect(mockMapCardanoMinimumViolation).toHaveBeenCalledWith({
      minimumOutputLovelace: "970000",
      coinMissingLovelace: "969999",
    });

    const discardCalls = sendMessage.mock.calls.filter(
      (c) => c[1]?.constructor?.name === "DiscardSendAdaTxDraftMsg"
    );
    expect(discardCalls.length).toBeGreaterThan(0);
    expect(discardCalls[0][1].draftId).toBe("d1");
  });

  it("keeps 1 lovelace parity path draft-based without allowZeroForMinimumCheck", async () => {
    const sendMessage = jest.fn().mockResolvedValueOnce({
      kind: "minimum_violation",
      minimumOutputLovelace: "970000",
      coinMissingLovelace: "969999",
    });

    const adapter = new CardanoSendAdapter(
      { sendMessage } as any,
      "cardano-preview"
    );
    const tx = adapter.makeSendTokenTx(
      "0.000001",
      currency,
      "addr_test1qrecipient"
    );
    expect(tx).toBeDefined();

    let thrownMessage = "";
    try {
      await tx!.simulate();
    } catch (error: any) {
      thrownMessage = String(error?.message ?? "");
    }
    expect(thrownMessage).toContain(
      "Amount too small. Minimum required is 0.97 tADA"
    );
    expect(thrownMessage).not.toContain("amount must be a positive number");

    const build = sendMessage.mock.calls[0][1];
    expect(build.constructor.name).toBe("BuildSendAdaTxDraftMsg");
    expect(build.amount).toBe("1");
    expect(build.allowZeroForMinimumCheck).toBe(false);
    expect(mockMapCardanoMinimumViolation).toHaveBeenCalledWith({
      minimumOutputLovelace: "970000",
      coinMissingLovelace: "969999",
    });
  });

  it("aborts send on minimum_violation build failure and never calls submit", async () => {
    const sendMessage = jest.fn().mockResolvedValue({
      kind: "minimum_violation",
      minimumOutputLovelace: "970000",
      coinMissingLovelace: "969999",
    });

    const onBroadcastFailed = jest.fn();
    const adapter = new CardanoSendAdapter(
      { sendMessage } as any,
      "cardano-preview"
    );
    const tx = adapter.makeSendTokenTx(
      "0.000001",
      currency,
      "addr_test1qrecipient"
    );
    expect(tx).toBeDefined();

    await expect(
      tx!.send({ amount: [], gas: "0" } as any, undefined, undefined, {
        onBroadcastFailed,
      })
    ).rejects.toThrow("Amount too small. Minimum required is 0.97 tADA");

    const submitCalls = sendMessage.mock.calls.filter((c) =>
      [
        "SubmitSendAdaTxDraftMsg",
        "SubmitSendAdaTxDraftWithPasswordMsg",
      ].includes(c[1]?.constructor?.name)
    );
    expect(submitCalls).toHaveLength(0);
    expect(onBroadcastFailed).toHaveBeenCalledTimes(1);
  });

  it("falls back to generic build error on malformed structured minimum violation", async () => {
    const sendMessage = jest.fn().mockResolvedValue({
      kind: "minimum_violation",
      minimumOutputLovelace: "bad",
      coinMissingLovelace: "1",
    });

    const adapter = new CardanoSendAdapter(
      { sendMessage } as any,
      "cardano-preview"
    );
    const tx = adapter.makeSendTokenTx(
      "0.000001",
      currency,
      "addr_test1qrecipient"
    );
    expect(tx).toBeDefined();

    await expect(tx!.simulate()).rejects.toThrow("Failed to build transaction");
  });
});
