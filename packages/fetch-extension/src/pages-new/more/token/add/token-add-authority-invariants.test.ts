/**
 * Token-add authority invariants — manual vs suggested binding.
 * Page must not Select/Persist (source lock). Store approve identity is in
 * tokens-store-suggested-approve.test.ts.
 */
import fs from "fs";
import path from "path";
import {
  planTokenAddSubmit,
  prepareTokenAddSuggested,
  resolveTokenAddBinding,
  type SuggestedTokenWaitingPayload,
} from "./prepare-token-add-request";
import type { RequestedChainRegistry } from "../../../../utils/requested-chain-context";

function waiting(
  partial: { id?: string; chainId?: string; contractAddress?: string } = {}
): SuggestedTokenWaitingPayload {
  return {
    id: partial.id ?? "token-interaction-1",
    data: {
      chainId: partial.chainId ?? "dorado-1",
      contractAddress:
        partial.contractAddress ??
        "fetch1contractaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  };
}

function registry(...chainIds: string[]): RequestedChainRegistry<any> {
  return {
    chainInfos: chainIds.map((chainId) => ({ chainId })) as any,
  };
}

describe("token-add authority invariants", () => {
  const reg = registry("fetchhub-4", "dorado-1", "cardano-preprod");

  it("manual mode uses active chain; suggested uses request", () => {
    const manual = resolveTokenAddBinding("fetchhub-4", reg, undefined);
    expect(manual).toEqual({
      mode: "manual",
      effectiveChainId: "fetchhub-4",
      writePath: "addToken",
    });
    expect(manual.mode).toBe("manual");
    if (manual.mode === "manual") {
      expect(planTokenAddSubmit(manual)).toEqual({
        type: "addToken",
        chainId: "fetchhub-4",
      });
    }

    const suggested = resolveTokenAddBinding(
      "fetchhub-4",
      reg,
      waiting({ chainId: "dorado-1" })
    );
    expect(suggested.mode).toBe("suggested");
    if (suggested.mode === "suggested") {
      expect(suggested.effectiveChainId).toBe("dorado-1");
      expect(planTokenAddSubmit(suggested)).toEqual({
        type: "approveSuggested",
        interactionId: "token-interaction-1",
        chainId: "dorado-1",
        destinationChainId: "dorado-1",
      });
    }
  });

  it("suggested Cardano request still resolves to request chain (not active)", () => {
    const binding = resolveTokenAddBinding(
      "fetchhub-4",
      reg,
      waiting({ chainId: "cardano-preprod" })
    );
    expect(binding.mode).toBe("suggested");
    if (binding.mode === "suggested") {
      expect(binding.effectiveChainId).toBe("cardano-preprod");
      expect(planTokenAddSubmit(binding)).toEqual({
        type: "approveSuggested",
        interactionId: "token-interaction-1",
        chainId: "cardano-preprod",
        destinationChainId: "cardano-preprod",
      });
    }
  });

  it("prepareTokenAddSuggested resolves without depending on active selection", () => {
    const prepared = prepareTokenAddSuggested(reg, waiting());
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.requested.chainInfo.chainId).toBe("dorado-1");
    }
  });

  describe("token-add page: no Select/Persist", () => {
    const pageSource = fs.readFileSync(
      path.join(__dirname, "index.tsx"),
      "utf8"
    );

    it("does not call selectChainAndPersist / selectChain", () => {
      expect(pageSource).not.toMatch(/selectChainAndPersist\s*\(/);
      expect(pageSource).not.toMatch(/\.selectChain\s*\(/);
    });

    it("uses resolveTokenAddBinding + RequestedChainProvider", () => {
      expect(pageSource).toMatch(/resolveTokenAddBinding\s*\(/);
      expect(pageSource).toMatch(/RequestedChainProvider/);
    });
  });
});
