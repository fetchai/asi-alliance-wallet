/**
 * Unit tests for structural sign/index.tsx source contracts.
 */
import {
  assertClearTicketOnlyViaDismissHelpers,
  assertPersistOnlyInsideOnSwitchNetwork,
  extractUseEffectBodies,
  findCallOffsets,
  sliceBalancedBlock,
} from "./sign-page-source-contracts";

describe("sign-page-source-contracts", () => {
  it("sliceBalancedBlock handles nesting", () => {
    const src = "const x = { a: { b: 1 }, c: 2 };";
    const open = src.indexOf("{");
    expect(sliceBalancedBlock(src, open)).toBe("{ a: { b: 1 }, c: 2 }");
  });

  it("assertPersistOnlyInsideOnSwitchNetwork rejects Persist in useEffect", () => {
    const bad = `
      useEffect(() => {
        chainStore.selectChainAndPersist("x");
      }, []);
      const onSwitchNetwork = async () => {
        await flowResult(chainStore.selectChainAndPersist("y"));
      };
    `;
    expect(() => assertPersistOnlyInsideOnSwitchNetwork(bad)).toThrow(
      /useEffect/
    );
  });

  it("assertPersistOnlyInsideOnSwitchNetwork rejects Persist outside onSwitchNetwork", () => {
    const bad = `
      useEffect(() => {}, []);
      const onOther = async () => {
        await flowResult(chainStore.selectChainAndPersist("x"));
      };
      const onSwitchNetwork = async () => {
        await flowResult(chainStore.selectChainAndPersist("y"));
      };
    `;
    expect(() => assertPersistOnlyInsideOnSwitchNetwork(bad)).toThrow(
      /outside onSwitchNetwork/
    );
  });

  it("assertPersistOnlyInsideOnSwitchNetwork accepts CTA-only Persist", () => {
    const ok = `
      useEffect(() => {
        void clearTicketOnSignDismiss({
          clearTicket: () => clearSignSwitchTicketBg(id),
        });
      }, []);
      const onSwitchNetwork = async () => {
        await flowResult(chainStore.selectChainAndPersist(effectiveChainId));
        await undoPersistAfterSupersede({
          restorePreviousAuthority: async (chainId) => {
            await flowResult(chainStore.selectChainAndPersist(chainId));
          },
        });
      };
    `;
    expect(() => assertPersistOnlyInsideOnSwitchNetwork(ok)).not.toThrow();
  });

  it("assertClearTicketOnlyViaDismissHelpers rejects bare clear", () => {
    const bad = `
      async function clearSignSwitchTicketBg(id?: string) {}
      useEffect(() => {
        clearSignSwitchTicketBg(id);
      }, []);
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(a), invalidateGateCache });
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(b), invalidateGateCache });
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(c), invalidateGateCache });
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(d) });
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(e) });
    `;
    expect(() => assertClearTicketOnlyViaDismissHelpers(bad)).toThrow(/bare/);
  });

  it("assertClearTicketOnlyViaDismissHelpers rejects dropping a dismiss site", () => {
    const fourSites = `
      async function clearSignSwitchTicketBg(id?: string) {}
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(a), invalidateGateCache });
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(b), invalidateGateCache });
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(c), invalidateGateCache });
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(d) });
    `;
    expect(() => assertClearTicketOnlyViaDismissHelpers(fourSites)).toThrow(
      /exactly 5/
    );
  });

  it("assertClearTicketOnlyViaDismissHelpers accepts five dismiss sites", () => {
    const ok = `
      async function clearSignSwitchTicketBg(id?: string) {}
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(a), invalidateGateCache });
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(b), invalidateGateCache });
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(c), invalidateGateCache });
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(d) });
      clearTicketOnSignDismiss({ clearTicket: () => clearSignSwitchTicketBg(e) });
    `;
    expect(() => assertClearTicketOnlyViaDismissHelpers(ok)).not.toThrow();
  });

  it("extractUseEffectBodies finds cleanup-containing effects", () => {
    const src = `
      useEffect(() => {
        return () => {
          void clearTicketOnSignDismiss({});
        };
      }, []);
    `;
    const bodies = extractUseEffectBodies(src);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatch(/clearTicketOnSignDismiss/);
    expect(findCallOffsets(bodies[0], "clearTicketOnSignDismiss")).toHaveLength(
      1
    );
  });
});
