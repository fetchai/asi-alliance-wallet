/**
 * TokensStore suggested-token approve/reject via waiting queue.
 * Runs the store flow (not only identity helpers).
 */
jest.mock("@keplr-wallet/background", () => {
  class SuggestTokenMsg {
    static type() {
      return "suggest-token";
    }
  }
  return {
    SuggestTokenMsg,
    AddTokenMsg: class AddTokenMsg {},
    GetTokensMsg: class GetTokensMsg {},
    RemoveTokenMsg: class RemoveTokenMsg {},
  };
});

import { flowResult } from "mobx";
import { SuggestTokenMsg } from "@keplr-wallet/background";
import { TokensStore } from "../../../../../../stores/src/core/tokens";

function waiting(partial?: { id?: string; chainId?: string }) {
  return {
    id: partial?.id ?? "token-interaction-1",
    data: {
      chainId: partial?.chainId ?? "dorado-1",
      contractAddress: "fetch1contractaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  };
}

function createTokensStore(
  waitingData: ReturnType<typeof waiting> | undefined
) {
  const approve = jest.fn(async () => undefined);
  const reject = jest.fn(async () => undefined);
  const interactionStore = {
    getDatas: jest.fn((type: string) => {
      if (type === SuggestTokenMsg.type() && waitingData) {
        return [waitingData];
      }
      return [];
    }),
    approve,
    reject,
    rejectAll: jest.fn(async () => undefined),
  };
  const chainStore = {
    addSetChainInfoHandler: jest.fn(),
    getChain: jest.fn(() => ({
      features: ["cosmwasm"],
      removeCurrencies: jest.fn(),
      addCurrencies: jest.fn(),
    })),
  };
  const requester = {
    sendMessage: jest.fn(async () => []),
  };
  const eventListener = {
    addEventListener: jest.fn(),
  };

  const store = new TokensStore(
    eventListener as any,
    chainStore as any,
    requester as any,
    interactionStore as any
  );

  return { store, approve, reject };
}

describe("TokensStore suggested-token waiting queue", () => {
  const currency = {
    coinDenom: "TKN",
    coinMinimalDenom: "tkn",
    coinDecimals: 6,
  };

  it("approveSuggestedToken fails closed when waiting chain drifts A→C", async () => {
    const { store, approve } = createTokensStore(
      waiting({ chainId: "columbus-5" })
    );

    await expect(
      flowResult(
        store.approveSuggestedToken(currency, {
          interactionId: "token-interaction-1",
          chainId: "dorado-1",
        })
      )
    ).rejects.toThrow(/chain id changed/i);
    expect(approve).not.toHaveBeenCalled();
  });

  it("approveSuggestedToken fails closed when interaction id replaced", async () => {
    const { store, approve } = createTokensStore(waiting());

    await expect(
      flowResult(
        store.approveSuggestedToken(currency, {
          interactionId: "other-id",
          chainId: "dorado-1",
        })
      )
    ).rejects.toThrow(/replaced/i);
    expect(approve).not.toHaveBeenCalled();
  });

  it("approveSuggestedToken proceeds when identity matches waiting queue", async () => {
    const { store, approve } = createTokensStore(waiting());

    await flowResult(
      store.approveSuggestedToken(currency, {
        interactionId: "token-interaction-1",
        chainId: "dorado-1",
      })
    );
    expect(approve).toHaveBeenCalledWith(
      SuggestTokenMsg.type(),
      "token-interaction-1",
      currency
    );
  });

  it("rejectSuggestedToken fails closed when interaction replaced", async () => {
    const { store, reject } = createTokensStore(waiting({ id: "other" }));

    await expect(
      flowResult(
        store.rejectSuggestedToken({ interactionId: "token-interaction-1" })
      )
    ).rejects.toThrow(/replaced/i);
    expect(reject).not.toHaveBeenCalled();
  });

  it("rejectSuggestedToken proceeds when identity matches", async () => {
    const { store, reject } = createTokensStore(waiting());

    await flowResult(
      store.rejectSuggestedToken({ interactionId: "token-interaction-1" })
    );
    expect(reject).toHaveBeenCalledWith(
      SuggestTokenMsg.type(),
      "token-interaction-1"
    );
  });
});
