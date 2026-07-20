import {
  applyNetworkProjectionBundle,
  type ApplyNetworkProjectionBundleDeps,
  type NetworkProjectionBundle,
} from "./apply-network-projection-bundle";
import type { SelectedChainAuthoritySnapshot } from "./apply-selected-chain-authority";

function deps(
  overrides: Partial<ApplyNetworkProjectionBundleDeps> & {
    getLocalSnapshot: ApplyNetworkProjectionBundleDeps["getLocalSnapshot"];
    setLocalSnapshot: ApplyNetworkProjectionBundleDeps["setLocalSnapshot"];
    setChainInfos: ApplyNetworkProjectionBundleDeps["setChainInfos"];
  }
): ApplyNetworkProjectionBundleDeps {
  return {
    ...overrides,
  };
}

describe("applyNetworkProjectionBundle", () => {
  it("updates registry when revision and chainId are unchanged", () => {
    let local: SelectedChainAuthoritySnapshot = {
      chainId: "fetchhub-4",
      revision: 3,
    };
    let infos = [{ chainId: "fetchhub-4", rpc: "old" }];

    const result = applyNetworkProjectionBundle(
      deps({
        getLocalSnapshot: () => ({ ...local }),
        setLocalSnapshot: (next) => {
          local = { ...next };
        },
        setChainInfos: (next) => {
          infos = next as typeof infos;
        },
      }),
      {
        selection: { chainId: "fetchhub-4", revision: 3 },
        chainInfos: [{ chainId: "fetchhub-4", rpc: "new" }],
      }
    );

    expect(result).toBe("already-current");
    expect(local).toEqual({ chainId: "fetchhub-4", revision: 3 });
    expect(infos[0].rpc).toBe("new");
  });

  it("rejects lower revision without mutating registry", () => {
    let local: SelectedChainAuthoritySnapshot = {
      chainId: "fetchhub-4",
      revision: 5,
    };
    let infos = [{ chainId: "fetchhub-4", rpc: "old" }];

    const result = applyNetworkProjectionBundle(
      deps({
        getLocalSnapshot: () => ({ ...local }),
        setLocalSnapshot: (next) => {
          local = { ...next };
        },
        setChainInfos: (next) => {
          infos = next as typeof infos;
        },
      }),
      {
        selection: { chainId: "dorado-1", revision: 2 },
        chainInfos: [
          { chainId: "fetchhub-4", rpc: "x" },
          { chainId: "dorado-1", rpc: "y" },
        ],
      }
    );

    expect(result).toBe("stale");
    expect(infos[0].rpc).toBe("old");
    expect(local.revision).toBe(5);
  });

  it("applies newer revision selection and registry together", () => {
    let local: SelectedChainAuthoritySnapshot = {
      chainId: "fetchhub-4",
      revision: 1,
    };
    let infos = [{ chainId: "fetchhub-4" }];

    const result = applyNetworkProjectionBundle(
      deps({
        getLocalSnapshot: () => ({ ...local }),
        setLocalSnapshot: (next) => {
          local = { ...next };
        },
        setChainInfos: (next) => {
          infos = next as typeof infos;
        },
      }),
      {
        selection: { chainId: "dorado-1", revision: 4 },
        chainInfos: [{ chainId: "fetchhub-4" }, { chainId: "dorado-1" }],
      }
    );

    expect(result).toBe("applied");
    expect(local).toEqual({ chainId: "dorado-1", revision: 4 });
    expect(infos).toHaveLength(2);
  });

  it("fails closed when selection is missing from chainInfos", () => {
    const result = applyNetworkProjectionBundle(
      deps({
        getLocalSnapshot: () => ({ chainId: "fetchhub-4", revision: 1 }),
        setLocalSnapshot: () => undefined,
        setChainInfos: () => undefined,
      }),
      {
        selection: { chainId: "missing", revision: 2 },
        chainInfos: [{ chainId: "fetchhub-4" }],
      } as NetworkProjectionBundle
    );
    expect(result).toBe("stale");
  });

  it("requires exact chainId membership (not identifier-only)", () => {
    let local = { chainId: "fetchhub-4", revision: 1 };
    let infos = [{ chainId: "fetchhub-4" }];

    const result = applyNetworkProjectionBundle(
      deps({
        getLocalSnapshot: () => ({ ...local }),
        setLocalSnapshot: (next) => {
          local = { ...next };
        },
        setChainInfos: (next) => {
          infos = next as typeof infos;
        },
      }),
      {
        selection: { chainId: "fetchhub-9", revision: 2 },
        chainInfos: [{ chainId: "fetchhub-4" }],
      }
    );

    expect(result).toBe("stale");
    expect(local).toEqual({ chainId: "fetchhub-4", revision: 1 });
    expect(infos).toEqual([{ chainId: "fetchhub-4" }]);
  });

  it("treats equal revision with different chainId as protocol violation", () => {
    let local = { chainId: "fetchhub-4", revision: 3 };
    let infos: Array<{ chainId: string; rpc?: string }> = [
      { chainId: "fetchhub-4" },
      { chainId: "dorado-1" },
    ];
    const onProtocolViolation = jest.fn();

    const result = applyNetworkProjectionBundle(
      deps({
        getLocalSnapshot: () => ({ ...local }),
        setLocalSnapshot: (next) => {
          local = { ...next };
        },
        setChainInfos: (next) => {
          infos = next as typeof infos;
        },
        onProtocolViolation,
      }),
      {
        selection: { chainId: "dorado-1", revision: 3 },
        chainInfos: [
          { chainId: "fetchhub-4", rpc: "x" },
          { chainId: "dorado-1" },
        ],
      }
    );

    expect(result).toBe("protocol-violation");
    expect(onProtocolViolation).toHaveBeenCalled();
    expect(local).toEqual({ chainId: "fetchhub-4", revision: 3 });
    expect(infos[0].rpc).toBeUndefined();
  });

  it("rejects revision 0 so cold-start placeholder cannot become ready", () => {
    let local = { chainId: "fetchhub-4", revision: 0 };
    let infos = [{ chainId: "fetchhub-4", rpc: "old" }];

    const result = applyNetworkProjectionBundle(
      deps({
        getLocalSnapshot: () => ({ ...local }),
        setLocalSnapshot: (next) => {
          local = { ...next };
        },
        setChainInfos: (next) => {
          infos = next as typeof infos;
        },
      }),
      {
        selection: { chainId: "fetchhub-4", revision: 0 },
        chainInfos: [{ chainId: "fetchhub-4", rpc: "new" }],
      }
    );

    expect(result).toBe("stale");
    expect(infos[0].rpc).toBe("old");
    expect(local.revision).toBe(0);
  });
});
