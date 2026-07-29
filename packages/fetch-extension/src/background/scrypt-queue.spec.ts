import { runScryptExclusive } from "./scrypt-queue";

describe("runScryptExclusive", () => {
  it("runs only one operation at a time", async () => {
    let active = 0;
    let maxConcurrent = 0;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runScryptExclusive(async () => {
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      await firstGate;
      active -= 1;
      return "first";
    });
    const second = runScryptExclusive(async () => {
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      active -= 1;
      return "second";
    });

    await Promise.resolve();
    expect(active).toBe(1);

    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ]);
    expect(maxConcurrent).toBe(1);
  });

  it("continues after an operation rejects", async () => {
    const first = runScryptExclusive(async () => {
      throw new Error("failed");
    });
    const second = runScryptExclusive(async () => "recovered");

    await expect(first).rejects.toThrow("failed");
    await expect(second).resolves.toBe("recovered");
  });
});
