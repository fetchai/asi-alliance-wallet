import {
  applySelectedChainAuthority,
  type SelectedChainApplyResult,
  type SelectedChainAuthoritySnapshot,
} from "./apply-selected-chain-authority";

export type NetworkProjectionBundle = {
  selection: SelectedChainAuthoritySnapshot;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chainInfos: readonly any[];
};

export type ApplyNetworkProjectionBundleDeps = {
  getLocalSnapshot: () => SelectedChainAuthoritySnapshot;
  setLocalSnapshot: (snapshot: SelectedChainAuthoritySnapshot) => void;
  setChainInfos: (chainInfos: NetworkProjectionBundle["chainInfos"]) => void;
  onProtocolViolation?: (
    local: SelectedChainAuthoritySnapshot,
    incoming: SelectedChainAuthoritySnapshot
  ) => void;
};

/**
 * Atomically apply an authoritative projection bundle.
 * Selection must appear in chainInfos by exact chainId; revision must be >= 1.
 * Equal rev + same chainId still refreshes chainInfos.
 */
export function applyNetworkProjectionBundle(
  deps: ApplyNetworkProjectionBundleDeps,
  bundle: NetworkProjectionBundle
): SelectedChainApplyResult {
  const incoming = bundle.selection;

  if (
    !Number.isSafeInteger(incoming.revision) ||
    incoming.revision < 1 ||
    !incoming.chainId
  ) {
    return "stale";
  }

  const inRegistry = bundle.chainInfos.some(
    (info) => info.chainId === incoming.chainId
  );
  if (!inRegistry) {
    return "stale";
  }

  const local = deps.getLocalSnapshot();

  if (incoming.revision < local.revision) {
    return "stale";
  }

  if (incoming.revision === local.revision) {
    if (incoming.chainId !== local.chainId) {
      deps.onProtocolViolation?.(local, incoming);
      return "protocol-violation";
    }
    // Equal revision + same chainId: refresh registry only.
    deps.setChainInfos(bundle.chainInfos);
    return "already-current";
  }

  const decision = applySelectedChainAuthority(local, incoming);
  if (decision === "stale" || decision === "protocol-violation") {
    if (decision === "protocol-violation") {
      deps.onProtocolViolation?.(local, incoming);
    }
    return decision;
  }

  deps.setChainInfos(bundle.chainInfos);
  deps.setLocalSnapshot({
    chainId: incoming.chainId,
    revision: incoming.revision,
  });
  return "applied";
}
