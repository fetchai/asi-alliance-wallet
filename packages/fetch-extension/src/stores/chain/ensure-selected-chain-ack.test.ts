import { ensureSelectedChainAck } from "./ensure-selected-chain-ack";

describe("ensureSelectedChainAck", () => {
  it("resolves after successful background ack", async () => {
    const calls: string[] = [];

    await ensureSelectedChainAck(async (chainId: string) => {
      calls.push(`ack:${chainId}`);
    }, "fetchhub-4");

    expect(calls).toEqual(["ack:fetchhub-4"]);
  });

  it("rejects on failed background ack without local side effects", async () => {
    const calls: string[] = [];

    await expect(
      ensureSelectedChainAck(async () => {
        calls.push("ack:fail");
        throw new Error("Network switch handler failed");
      }, "fetchhub-4")
    ).rejects.toThrow("Network switch handler failed");

    expect(calls).toEqual(["ack:fail"]);
  });
});
