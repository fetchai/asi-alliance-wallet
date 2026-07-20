import { createProjectionHydrationGate } from "./hydration-gate";

describe("createProjectionHydrationGate", () => {
  it("does not release queries or clear initializing until first success", () => {
    const releaseInitialQueries = jest.fn();
    const setInitializing = jest.fn();
    const onFirstSuccess = jest.fn();

    const gate = createProjectionHydrationGate({
      releaseInitialQueries,
      setInitializing,
      onFirstSuccess,
    });

    expect(gate.hasReleasedInitialQueries).toBe(false);
    expect(releaseInitialQueries).not.toHaveBeenCalled();
    expect(setInitializing).not.toHaveBeenCalled();
  });

  it("on first pull success releases queries, clears initializing, runs bootstrap once", () => {
    const releaseInitialQueries = jest.fn();
    const setInitializing = jest.fn();
    const onFirstSuccess = jest.fn();

    const gate = createProjectionHydrationGate({
      releaseInitialQueries,
      setInitializing,
      onFirstSuccess,
    });

    gate.onPullSucceeded();

    expect(gate.hasReleasedInitialQueries).toBe(true);
    expect(releaseInitialQueries).toHaveBeenCalledTimes(1);
    expect(onFirstSuccess).toHaveBeenCalledTimes(1);
    expect(setInitializing).toHaveBeenCalledWith(false);

    gate.onPullSucceeded();
    expect(releaseInitialQueries).toHaveBeenCalledTimes(1);
    expect(onFirstSuccess).toHaveBeenCalledTimes(1);
    expect(setInitializing).toHaveBeenCalledTimes(2);
  });

  it("late success after failed attempts still releases the gate once", () => {
    const releaseInitialQueries = jest.fn();
    const setInitializing = jest.fn();

    const gate = createProjectionHydrationGate({
      releaseInitialQueries,
      setInitializing,
    });

    // Simulate cold-start failures: gate untouched.
    expect(gate.hasReleasedInitialQueries).toBe(false);

    gate.onPullSucceeded();
    expect(releaseInitialQueries).toHaveBeenCalledTimes(1);
    expect(setInitializing).toHaveBeenCalledWith(false);
  });
});
