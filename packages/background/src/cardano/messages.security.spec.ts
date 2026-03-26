import {
  BuildSendAdaTxDraftMsg,
  DiscardSendAdaTxDraftMsg,
  EstimateSendAdaMsg,
  GetCardanoBalanceMsg,
  GetCardanoTxHistoryMsg,
  GetMaxSpendableAdaMsg,
  IsCardanoReadyMsg,
  SubmitSendAdaTxDraftMsg,
  SubmitSendAdaTxDraftWithPasswordMsg,
} from "./messages";
import { getHandler } from "./handler";

describe("Cardano message security boundaries", () => {
  it("keeps EstimateSendAda internal-only", () => {
    const msg = new EstimateSendAdaMsg("addr_test1q...", "1000000");
    expect(msg.approveExternal()).toBe(false);
  });

  it("keeps internal-only Cardano financial messages closed to external", () => {
    expect(new GetCardanoBalanceMsg().approveExternal()).toBe(false);
    expect(new GetCardanoTxHistoryMsg(20).approveExternal()).toBe(false);
    expect(
      new GetMaxSpendableAdaMsg("cardano-mainnet", "addr_test1q...").approveExternal()
    ).toBe(false);
    expect(
      new BuildSendAdaTxDraftMsg("addr_test1q...", "1000000").approveExternal()
    ).toBe(false);
    expect(new SubmitSendAdaTxDraftMsg("draft-id").approveExternal()).toBe(false);
    expect(
      new SubmitSendAdaTxDraftWithPasswordMsg("draft-id", "password").approveExternal()
    ).toBe(false);
    expect(new DiscardSendAdaTxDraftMsg("draft-id").approveExternal()).toBe(false);
  });

  it("keeps IsCardanoReady externally callable", () => {
    expect(new IsCardanoReadyMsg().approveExternal()).toBe(true);
  });
});

describe("Cardano estimate handler path", () => {
  it("allows internal estimate requests without external permission checks", async () => {
    const service = {
      isReady: jest.fn(() => true),
      estimateSendAda: jest.fn(async () => ({
        fee: "1234",
        total: "11234",
      })),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(async () => undefined),
    };
    const permissionService = {
      checkOrGrantBasicAccessPermission: jest.fn(async () => undefined),
    };

    const handler = getHandler(
      service as any,
      keyRingService as any,
      permissionService as any
    );

    const msg = new EstimateSendAdaMsg(
      "addr_test1q...",
      "10000",
      "memo",
      "cardano-mainnet"
    );

    const result = await handler({ isInternalMsg: true } as any, msg as any);

    expect(permissionService.checkOrGrantBasicAccessPermission).not.toHaveBeenCalled();
    expect(keyRingService.ensureCardanoServiceReady).toHaveBeenCalledWith(
      "cardano-mainnet"
    );
    expect(service.estimateSendAda).toHaveBeenCalledWith({
      to: "addr_test1q...",
      amount: "10000",
      memo: "memo",
      assets: undefined,
    });
    expect(result).toEqual({ fee: "1234", total: "11234" });
  });
});
