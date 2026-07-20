import {
  issueSignSwitchTicket,
  isSignSwitchTicketValid,
  type SignSwitchTicket,
} from "./sign-switch-ticket";

const match = (a: string, b: string) => a === b;

describe("sign-switch-ticket", () => {
  it("issues when authority matches requested chain", () => {
    const ticket = issueSignSwitchTicket(
      { chainId: "cardano-preprod", revision: 3 },
      "ix-1",
      "cardano-preprod",
      match
    );
    expect(ticket).toEqual({
      interactionId: "ix-1",
      chainId: "cardano-preprod",
      authorityRevision: 3,
    });
  });

  it("refuses to issue when authority differs", () => {
    expect(() =>
      issueSignSwitchTicket(
        { chainId: "fetchhub-4", revision: 1 },
        "ix-1",
        "cardano-preprod",
        match
      )
    ).toThrow(/authority is not on the requested chain/);
  });

  it("stays valid at the same authority revision", () => {
    const ticket: SignSwitchTicket = {
      interactionId: "ix-1",
      chainId: "cardano-preprod",
      authorityRevision: 3,
    };
    expect(
      isSignSwitchTicketValid(
        ticket,
        { chainId: "cardano-preprod", revision: 3 },
        "ix-1",
        "cardano-preprod",
        match
      )
    ).toBe(true);
  });

  it("invalidates when authority revision bumps after concurrent Select", () => {
    const ticket: SignSwitchTicket = {
      interactionId: "ix-1",
      chainId: "cardano-preprod",
      authorityRevision: 3,
    };
    expect(
      isSignSwitchTicketValid(
        ticket,
        { chainId: "dorado-1", revision: 4 },
        "ix-1",
        "cardano-preprod",
        match
      )
    ).toBe(false);
  });

  it("invalidates when revision bumps even if chain returns to requested", () => {
    const ticket: SignSwitchTicket = {
      interactionId: "ix-1",
      chainId: "cardano-preprod",
      authorityRevision: 3,
    };
    expect(
      isSignSwitchTicketValid(
        ticket,
        { chainId: "cardano-preprod", revision: 5 },
        "ix-1",
        "cardano-preprod",
        match
      )
    ).toBe(false);
  });

  it("invalidates for a different interaction id", () => {
    const ticket: SignSwitchTicket = {
      interactionId: "ix-1",
      chainId: "cardano-preprod",
      authorityRevision: 3,
    };
    expect(
      isSignSwitchTicketValid(
        ticket,
        { chainId: "cardano-preprod", revision: 3 },
        "ix-2",
        "cardano-preprod",
        match
      )
    ).toBe(false);
  });
});
