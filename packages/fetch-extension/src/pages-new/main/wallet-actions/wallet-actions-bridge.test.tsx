import React from "react";
import { renderToString } from "react-dom/server";

/** Smoke: visibility of Bridge card only; does not exercise click or native_bridge_click analytics. */

jest.mock("../../../config", () => ({
  TXNTYPE: { send: "send" },
}));

import { WalletActions } from "./index";

jest.mock("mobx-react-lite", () => ({
  observer: (c: unknown) => c,
}));

const mockLogEvent = jest.fn();
const mockNavigate = jest.fn();

let mockChainId = "cardano-preview";

jest.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock("../../../stores", () => ({
  useStore: () => ({
    accountStore: {
      getAccount: () => ({
        bech32Address: "addr1test",
        ethereumHexAddress: "",
      }),
    },
    chainStore: {
      current: {
        get chainId() {
          return mockChainId;
        },
        beta: false,
        chainInfos: [],
      },
    },
    queriesStore: {
      get: () => ({
        queryBalances: {
          getQueryBech32Address: () => ({
            stakable: {
              balance: {
                toDec: () => ({ gt: () => false }),
              },
            },
          }),
        },
      }),
    },
    activityStore: {
      getPendingTxnTypes: {},
    },
    analyticsStore: {
      logEvent: mockLogEvent,
    },
  }),
}));

jest.mock("@utils/moonpay-currency", () => ({
  useMoonpayCurrency: () => ({ data: [] }),
  checkAddressIsBuySellWhitelisted: () => false,
}));

jest.mock("../../more/token/moonpay/utils", () => ({
  moonpaySupportedTokensByChainId: () => [],
}));

jest.mock("@components-v2/dropdown", () => ({
  Dropdown: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown">{children}</div>
  ),
}));

jest.mock("@components-v2/card", () => ({
  Card: (props: {
    heading?: string;
    onClick?: () => void;
    "data-testid"?: string;
  }) => (
    <button
      type="button"
      data-testid={`card-${props.heading}`}
      data-heading={props.heading}
      onClick={props.onClick}
    >
      {props.heading}
    </button>
  ),
}));

describe("WalletActions native bridge entry", () => {
  beforeEach(() => {
    mockLogEvent.mockClear();
    mockNavigate.mockClear();
    mockChainId = "cardano-preview";
  });

  it("does not render Bridge card on Cardano; native_bridge_click is not possible", () => {
    const html = renderToString(
      <WalletActions isOpen={true} setIsOpen={() => undefined} />
    );

    expect(html).not.toContain('data-testid="card-Bridge"');
    expect(html).not.toContain('data-heading="Bridge"');
    mockLogEvent.mockClear();
  });

  it("renders Bridge card on Ethereum; click would use native_bridge_click", () => {
    mockChainId = "1";
    const html = renderToString(
      <WalletActions isOpen={true} setIsOpen={() => undefined} />
    );

    expect(html).toContain('data-heading="Bridge"');
  });
});
