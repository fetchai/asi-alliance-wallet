import { computeDraftSummaryHash } from "./draft-summary-hash";

describe("CardanoService draft summary digest", () => {
  const baseDraft = {
    to: "addr_test1qrecipient",
    amount: "1000000",
    memo: "memo",
    fee: "170000",
    total: "1170000",
    minAdaForTokens: "",
    assets: [
      { assetId: "policy1assetB", amount: "2" },
      { assetId: "policy1assetA", amount: "1" },
    ],
    networkId: "cardano-preview",
    selectedAccountAddress: "addr_test1qsender",
  };

  it("produces stable digest for same semantic payload", () => {
    const digestA = computeDraftSummaryHash(baseDraft);
    const digestB = computeDraftSummaryHash({
      ...baseDraft,
      assets: [...baseDraft.assets].reverse(),
    });

    expect(digestA).toEqual(digestB);
    expect(digestA).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes digest when critical fields change", () => {
    const digest = computeDraftSummaryHash(baseDraft);

    const changedTo = computeDraftSummaryHash({
      ...baseDraft,
      to: "addr_test1qchanged",
    });
    const changedAmount = computeDraftSummaryHash({
      ...baseDraft,
      amount: "2000000",
    });
    const changedFee = computeDraftSummaryHash({
      ...baseDraft,
      fee: "180000",
    });
    const changedSender = computeDraftSummaryHash({
      ...baseDraft,
      selectedAccountAddress: "addr_test1qother",
    });
    const changedNetwork = computeDraftSummaryHash({
      ...baseDraft,
      networkId: "cardano-mainnet",
    });

    expect(changedTo).not.toEqual(digest);
    expect(changedAmount).not.toEqual(digest);
    expect(changedFee).not.toEqual(digest);
    expect(changedSender).not.toEqual(digest);
    expect(changedNetwork).not.toEqual(digest);
  });
});
