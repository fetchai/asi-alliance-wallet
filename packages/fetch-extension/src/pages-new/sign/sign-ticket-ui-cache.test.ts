import {
  classifyAuthorityRefreshResult,
  classifyTicketRefreshResult,
  epochAfterIssueSignSwitchTicket,
  nextGateCacheEpoch,
  nextTicketCacheEpoch,
  resolveAuthorityChainIdWithEpochRetry,
  resolvePreApproveGateReads,
  resolveTicketValidWithEpochRetry,
  shouldApplyTicketRefreshResult,
} from "./sign-ticket-ui-cache";

describe("sign-ticket-ui-cache", () => {
  it("drops stale valid:true after concurrent Select invalidate", () => {
    let epoch = 0;
    epoch = nextTicketCacheEpoch(epoch); // invalidate on Select / sync
    const inFlightEpoch = 0; // query started before invalidate
    expect(shouldApplyTicketRefreshResult(inFlightEpoch, epoch)).toBe(false);
    expect(classifyTicketRefreshResult(inFlightEpoch, epoch, true)).toEqual({
      kind: "dropped",
    });
  });

  it("applies refresh when epoch still matches", () => {
    const epoch = 3;
    expect(shouldApplyTicketRefreshResult(3, epoch)).toBe(true);
    expect(classifyTicketRefreshResult(3, epoch, true)).toEqual({
      kind: "applied",
      valid: true,
    });
  });

  it("post-Issue epoch bump drops pre-Issue valid:false", () => {
    let epoch = 1;
    // surfaces-sync after Persist started refresh at epoch 1
    const preIssueQueryEpoch = epoch;
    // Issue then invalidate so pre-Issue answers cannot write
    epoch = epochAfterIssueSignSwitchTicket(epoch);
    expect(epoch).toBe(2);
    expect(shouldApplyTicketRefreshResult(preIssueQueryEpoch, epoch)).toBe(
      false
    );
    // post-Issue refresh uses new epoch and may write true
    expect(shouldApplyTicketRefreshResult(epoch, epoch)).toBe(true);
  });

  it("epoch-dropped query is not treated as BG invalid — retry applies true", async () => {
    let epoch = 1;
    let calls = 0;
    const result = await resolveTicketValidWithEpochRetry({
      getEpoch: () => epoch,
      queryValid: async () => {
        calls += 1;
        if (calls === 1) {
          // Simulate surfaces-sync invalidate while first query in flight
          epoch = nextTicketCacheEpoch(epoch);
          return false; // would be pre-Issue false or any stale answer
        }
        return true; // BG ticket valid at current epoch
      },
    });

    expect(calls).toBe(2);
    expect(result).toEqual({ applied: true, valid: true });
  });

  it("applied BG false stays false (no infinite retry)", async () => {
    const result = await resolveTicketValidWithEpochRetry({
      getEpoch: () => 0,
      queryValid: async () => false,
    });
    expect(result).toEqual({ applied: true, valid: false });
  });

  it("applied query error is valid:false; dropped error retries", async () => {
    let epoch = 0;
    let calls = 0;
    const result = await resolveTicketValidWithEpochRetry({
      getEpoch: () => epoch,
      queryValid: async () => {
        calls += 1;
        if (calls === 1) {
          epoch = nextTicketCacheEpoch(epoch);
          throw new Error("aborted");
        }
        return true;
      },
    });
    expect(calls).toBe(2);
    expect(result).toEqual({ applied: true, valid: true });
  });

  it("authority invalidate clears match arm: drop stale requested id", () => {
    let epoch = 0;
    const staleRequested = "cardano-preprod";
    epoch = nextGateCacheEpoch(epoch);
    expect(classifyAuthorityRefreshResult(0, epoch, staleRequested)).toEqual({
      kind: "dropped",
    });
  });

  it("authority epoch-drop retries then applies post-Select chain", async () => {
    let epoch = 1;
    let calls = 0;
    const result = await resolveAuthorityChainIdWithEpochRetry({
      getEpoch: () => epoch,
      queryChainId: async () => {
        calls += 1;
        if (calls === 1) {
          epoch = nextGateCacheEpoch(epoch);
          return "cardano-preprod"; // stale pre-Select
        }
        return "fetchhub-4"; // post-Select BG authority
      },
    });
    expect(calls).toBe(2);
    expect(result).toEqual({ applied: true, chainId: "fetchhub-4" });
  });

  it("pre-approve reads authority before ticket (never unordered)", async () => {
    const order: string[] = [];
    const result = await resolvePreApproveGateReads({
      refreshAuthorityChainId: async () => {
        order.push("authority");
        return "cardano-preprod";
      },
      queryTicketValid: async () => {
        order.push("ticket");
        return true;
      },
    });
    expect(order).toEqual(["authority", "ticket"]);
    expect(result).toEqual({
      authorityChainId: "cardano-preprod",
      ticketValid: true,
    });
  });

  it("pre-approve re-reads authority after ticket:false (Select-between)", async () => {
    const order: string[] = [];
    let authorityCalls = 0;
    const result = await resolvePreApproveGateReads({
      refreshAuthorityChainId: async () => {
        authorityCalls += 1;
        order.push(`authority-${authorityCalls}`);
        // First read: still on requested; after Select during ticket query: moved.
        return authorityCalls === 1 ? "cardano-preprod" : "fetchhub-4";
      },
      queryTicketValid: async () => {
        order.push("ticket");
        return false;
      },
    });
    expect(order).toEqual(["authority-1", "ticket", "authority-2"]);
    expect(result).toEqual({
      authorityChainId: "fetchhub-4",
      ticketValid: false,
    });
  });
});
