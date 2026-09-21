/**
 * Cardano sign authority / ticket invariants.
 * Prepare helpers are request-scoped (no chainStore). Page Persist/dismiss
 * sites are locked structurally via sign-page-source-contracts (Persist only
 * inside onSwitchNetwork; clearTicketBg only as clearTicket callbacks).
 * ProviderCount locks live in cardano lease/telemetry suite (wired transport).
 */
import fs from "fs";
import path from "path";
import {
  assertSignApproveStillValid,
  prepareSignRequest,
  requiresCardanoLiveNetworkSwitch,
  type SignWaitingPayload,
} from "./prepare-sign-request";
import { SignDocWrapper } from "@keplr-wallet/cosmos";
import {
  issueSignSwitchTicket,
  isSignSwitchTicketValid,
} from "../../../../background/src/chains/sign-switch-ticket";
import {
  classifyTicketRefreshResult,
  epochAfterIssueSignSwitchTicket,
  nextGateCacheEpoch,
  resolvePreApproveGateReads,
  resolveTicketValidWithEpochRetry,
} from "./sign-ticket-ui-cache";
import {
  clearTicketOnSignDismiss,
  queryTicketValidForApprove,
  undoPersistAfterSupersede,
} from "./sign-switch-cta";
import {
  assertClearTicketOnlyViaDismissHelpers,
  assertPersistOnlyInsideOnSwitchNetwork,
} from "./sign-page-source-contracts";

function aminoWrapper(chainId: string): SignDocWrapper {
  return SignDocWrapper.fromAminoSignDoc({
    chain_id: chainId,
    account_number: "0",
    sequence: "0",
    fee: { amount: [], gas: "1" },
    msgs: [],
    memo: "",
  });
}

function waiting(partial: {
  id?: string;
  chainId: string;
}): SignWaitingPayload {
  return {
    id: partial.id ?? "interaction-1",
    isInternal: false,
    data: {
      chainId: partial.chainId,
      msgOrigin: "https://dapp.example",
      signer: "addr_test1signer",
      signDocWrapper: aminoWrapper(partial.chainId),
      signOptions: {},
    },
  };
}

const match = (a: string, b: string) => a === b;

const registry = {
  chainInfos: [{ chainId: "fetchhub-4" }, { chainId: "cardano-preprod" }],
} as any;

describe("cardano sign authority invariants", () => {
  describe("unconfirmed open: prepare + approve gate", () => {
    it("prepareSignRequest resolves Cardano request without active selection", () => {
      const result = prepareSignRequest(
        registry,
        waiting({ chainId: "cardano-preprod" })
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.requested.chainInfo.chainId).toBe("cardano-preprod");
      }
    });

    it("Approve stays gated while authority is non-Cardano and ticket absent", () => {
      expect(
        requiresCardanoLiveNetworkSwitch({
          requestedChainId: "cardano-preprod",
          authorityChainId: "fetchhub-4",
          isADR36: false,
          switchTicketValid: false,
        })
      ).toBe(true);

      expect(() =>
        assertSignApproveStillValid(
          waiting({ chainId: "cardano-preprod" }),
          "interaction-1",
          "cardano-preprod",
          {
            requestedRegistryChainId: "cardano-preprod",
            authorityChainId: "fetchhub-4",
            isADR36: false,
            switchTicketValid: false,
          }
        )
      ).toThrow(/network switch/i);
    });
  });

  describe("sign page: Persist only on CTA; dismiss via helpers", () => {
    const pageSource = fs.readFileSync(
      path.join(__dirname, "index.tsx"),
      "utf8"
    );

    it("selectChainAndPersist only inside onSwitchNetwork (never in useEffect)", () => {
      expect(() =>
        assertPersistOnlyInsideOnSwitchNetwork(pageSource)
      ).not.toThrow();
      expect(pageSource).toMatch(/prepareSignRequest\s*\(/);
      expect(pageSource).toMatch(/IssueSignSwitchTicketMsg/);
    });

    it("clearSignSwitchTicketBg only via clearTicket callbacks into dismiss helpers", () => {
      expect(() =>
        assertClearTicketOnlyViaDismissHelpers(pageSource)
      ).not.toThrow();
    });
  });

  describe("ticket under lag + concurrent Select", () => {
    it("valid ticket enables Approve under projection lag", () => {
      const authority = { chainId: "cardano-preprod", revision: 2 };
      const ticket = issueSignSwitchTicket(
        authority,
        "interaction-1",
        "cardano-preprod",
        match
      );
      expect(
        isSignSwitchTicketValid(
          ticket,
          authority,
          "interaction-1",
          "cardano-preprod",
          match
        )
      ).toBe(true);

      expect(
        requiresCardanoLiveNetworkSwitch({
          requestedChainId: "cardano-preprod",
          authorityChainId: "fetchhub-4",
          isADR36: false,
          switchTicketValid: true,
        })
      ).toBe(false);

      expect(() =>
        assertSignApproveStillValid(
          waiting({ chainId: "cardano-preprod" }),
          "interaction-1",
          "cardano-preprod",
          {
            requestedRegistryChainId: "cardano-preprod",
            authorityChainId: "fetchhub-4",
            isADR36: false,
            switchTicketValid: true,
          }
        )
      ).not.toThrow();
    });

    it("Select back to pre-CTA authority invalidates ticket and re-gates Approve", () => {
      const authority = { chainId: "cardano-preprod", revision: 2 };
      const ticket = issueSignSwitchTicket(
        authority,
        "interaction-1",
        "cardano-preprod",
        match
      );

      authority.chainId = "fetchhub-4";
      authority.revision = 3;

      expect(
        isSignSwitchTicketValid(
          ticket,
          authority,
          "interaction-1",
          "cardano-preprod",
          match
        )
      ).toBe(false);

      expect(
        requiresCardanoLiveNetworkSwitch({
          requestedChainId: "cardano-preprod",
          authorityChainId: authority.chainId,
          isADR36: false,
          switchTicketValid: false,
        })
      ).toBe(true);

      expect(() =>
        assertSignApproveStillValid(
          waiting({ chainId: "cardano-preprod" }),
          "interaction-1",
          "cardano-preprod",
          {
            requestedRegistryChainId: "cardano-preprod",
            authorityChainId: authority.chainId,
            isADR36: false,
            switchTicketValid: false,
          }
        )
      ).toThrow(/network switch/i);
    });
  });

  describe("UI ticket-cache contract", () => {
    it("epoch invalidate drops stale valid:true (drop ≠ BG invalid)", () => {
      let epoch = 0;
      epoch = nextGateCacheEpoch(epoch);
      expect(classifyTicketRefreshResult(0, epoch, true)).toEqual({
        kind: "dropped",
      });
    });

    it("post-Issue epoch bump drops pre-Issue valid:false", () => {
      let epoch = 1;
      const preIssueQueryEpoch = epoch;
      epoch = epochAfterIssueSignSwitchTicket(epoch);
      expect(
        classifyTicketRefreshResult(preIssueQueryEpoch, epoch, false)
      ).toEqual({
        kind: "dropped",
      });
    });

    it("resolveTicketValidWithEpochRetry retries drop≠invalid until applied", async () => {
      let epoch = 1;
      let calls = 0;
      const result = await resolveTicketValidWithEpochRetry({
        getEpoch: () => epoch,
        queryValid: async () => {
          calls += 1;
          if (calls === 1) {
            epoch = nextGateCacheEpoch(epoch);
            return false;
          }
          return true;
        },
      });
      expect(calls).toBe(2);
      expect(result).toEqual({ applied: true, valid: true });
    });

    it("pre-approve reads authority before ticket (order lock)", async () => {
      const order: string[] = [];
      const result = await resolvePreApproveGateReads({
        refreshAuthorityChainId: async () => {
          order.push("authority");
          return "fetchhub-4";
        },
        queryTicketValid: async () => {
          order.push("ticket");
          return false;
        },
      });
      expect(order).toEqual(["authority", "ticket", "authority"]);
      expect(result.ticketValid).toBe(false);
    });

    it("clear-on-reject dismisses BG ticket and invalidates gate cache", async () => {
      const clearTicket = jest.fn(async () => undefined);
      const invalidateGateCache = jest.fn();
      await clearTicketOnSignDismiss({ clearTicket, invalidateGateCache });
      expect(clearTicket).toHaveBeenCalledTimes(1);
      expect(invalidateGateCache).toHaveBeenCalledTimes(1);
    });

    it("shell / prepare-failure dismiss still clears ticket without gate cache", async () => {
      const clearTicket = jest.fn(async () => undefined);
      await clearTicketOnSignDismiss({ clearTicket });
      expect(clearTicket).toHaveBeenCalledTimes(1);
    });
  });

  describe("double fresh BG ticket on pre-approve", () => {
    it("requires two successful refresh reads; sticky true alone is insufficient", async () => {
      let calls = 0;
      const refresh = jest.fn(async () => {
        calls += 1;
        return calls === 1;
      });

      await expect(queryTicketValidForApprove(refresh)).resolves.toBe(false);
      expect(refresh).toHaveBeenCalledTimes(2);

      refresh.mockClear();
      calls = 0;
      refresh.mockImplementation(async () => {
        calls += 1;
        return true;
      });
      await expect(queryTicketValidForApprove(refresh)).resolves.toBe(true);
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("short-circuits on first false without trusting a sticky UI cache", async () => {
      const refresh = jest.fn(async () => false);
      await expect(queryTicketValidForApprove(refresh)).resolves.toBe(false);
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe("mid-CTA supersede undo", () => {
    it("clears ticket and restores previous BG authority after post-Persist failure", async () => {
      const clearTicket = jest.fn(async () => undefined);
      const invalidateGateCache = jest.fn();
      const restorePreviousAuthority = jest.fn(async () => undefined);

      await undoPersistAfterSupersede({
        clearTicket,
        invalidateGateCache,
        previousAuthorityChainId: "fetchhub-4",
        effectiveChainId: "cardano-preprod",
        restorePreviousAuthority,
      });

      expect(clearTicket).toHaveBeenCalledTimes(1);
      expect(invalidateGateCache).toHaveBeenCalledTimes(1);
      expect(restorePreviousAuthority).toHaveBeenCalledWith("fetchhub-4");
    });

    it("skips restore when previous already equals requested", async () => {
      const restorePreviousAuthority = jest.fn(async () => undefined);
      await undoPersistAfterSupersede({
        clearTicket: async () => undefined,
        invalidateGateCache: () => undefined,
        previousAuthorityChainId: "cardano-preprod",
        effectiveChainId: "cardano-preprod",
        restorePreviousAuthority,
      });
      expect(restorePreviousAuthority).not.toHaveBeenCalled();
    });
  });
});
