import { ensureSelectedChainAck } from "./ensure-selected-chain-ack";

describe("ensureSelectedChainAck", () => {
  it("resolves with background ack snapshot", async () => {
    const calls: string[] = [];

    await expect(
      ensureSelectedChainAck(async (chainId: string) => {
        calls.push(`ack:${chainId}`);
        return { chainId, revision: 2 };
      }, "fetchhub-4")
    ).resolves.toEqual({ chainId: "fetchhub-4", revision: 2 });

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
