/**
 * In-memory sign-page switch ticket: proves Select ACK for a live Cardano
 * request without relying on UI projection lag.
 *
 * Valid only while NetworkAuthority revision is unchanged since issue.
 * Any later Select bumps revision → invalid.
 */

export type SignSwitchTicket = {
  interactionId: string;
  chainId: string;
  authorityRevision: number;
};

export type AuthoritySnapshotForTicket = {
  chainId: string;
  revision: number;
};

export function issueSignSwitchTicket(
  current: AuthoritySnapshotForTicket,
  interactionId: string,
  expectedChainId: string,
  chainIdsMatch: (a: string, b: string) => boolean
): SignSwitchTicket {
  if (!interactionId) {
    throw new Error("Cannot issue sign switch ticket: missing interaction id");
  }
  if (!expectedChainId) {
    throw new Error("Cannot issue sign switch ticket: missing chain id");
  }
  if (!chainIdsMatch(current.chainId, expectedChainId)) {
    throw new Error(
      "Cannot issue sign switch ticket: authority is not on the requested chain"
    );
  }
  return {
    interactionId,
    chainId: expectedChainId,
    authorityRevision: current.revision,
  };
}

export function isSignSwitchTicketValid(
  ticket: SignSwitchTicket | null | undefined,
  current: AuthoritySnapshotForTicket,
  interactionId: string,
  expectedChainId: string,
  chainIdsMatch: (a: string, b: string) => boolean
): boolean {
  if (!ticket) {
    return false;
  }
  if (ticket.interactionId !== interactionId) {
    return false;
  }
  if (!chainIdsMatch(ticket.chainId, expectedChainId)) {
    return false;
  }
  if (ticket.authorityRevision !== current.revision) {
    return false;
  }
  return chainIdsMatch(current.chainId, expectedChainId);
}
