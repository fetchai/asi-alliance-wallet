/** @jest-environment <rootDir>/jest.jsdom.environment.cjs */
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";

const mockSendMessage = jest.fn();
const SYNC_LABEL = "Wallet is syncing. Please wait...";

jest.mock("mobx-react-lite", () => ({
  observer: (component: unknown) => component,
}));

jest.mock("@keplr-wallet/cardano", () => ({
  lovelacesToAdaString: (v: string) => v,
  formatAssetAmount: (v: string) => v,
}));

jest.mock("@keplr-wallet/background", () => ({
  GetCardanoTxHistoryMsg: class GetCardanoTxHistoryMsg {
    static type() {
      return "cardano-get-tx-history";
    }
    constructor(
      public readonly pageSize: number,
      public readonly chainId?: string
    ) {}
  },
  LoadMoreCardanoTxHistoryMsg: class LoadMoreCardanoTxHistoryMsg {
    static type() {
      return "cardano-load-more-tx-history";
    }
    constructor(
      public readonly pageSize: number,
      public readonly chainId?: string
    ) {}
  },
  GetCardanoSyncStatusMsg: class GetCardanoSyncStatusMsg {
    static type() {
      return "cardano-get-sync-status";
    }
    constructor(
      public readonly chainId?: string,
      public readonly pollingVisibility?: string
    ) {}
  },
}));

jest.mock("@keplr-wallet/router-extension", () => ({
  InExtensionMessageRequester: jest.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
  })),
}));

jest.mock("../../../stores", () => ({
  useStore: () => ({
    chainStore: {
      current: {
        chainId: "cardano-preprod",
        stakeCurrency: { coinDenom: "tADA", coinImageUrl: undefined },
        currencies: [],
      },
    },
  }),
}));

jest.mock("../../../hooks", () => ({
  useNetwork: () => ({ isOnline: true }),
}));

jest.mock("react-intl", () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
}));

jest.mock("react-router", () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock("@components-v2/cardano/blockfrost-rate-limit-banner", () => ({
  CardanoBlockfrostRateLimitBanner: () => null,
}));

jest.mock("../native/style.module.scss", () => ({}));
jest.mock("./cardano-asset-utils", () => ({
  getCardanoAssetIconUrl: () => undefined,
}));
jest.mock("@assets/svg/wireframe/asi-send.svg", () => "send.svg");
jest.mock("@assets/svg/wireframe/activity-recieve.svg", () => "receive.svg");

import { CardanoTransactionsTab } from "./transactions";
import { GetCardanoTxHistoryMsg } from "@keplr-wallet/background";

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("CardanoTransactionsTab Activity UI", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockSendMessage.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  const renderTab = () => {
    act(() => {
      root.render(<CardanoTransactionsTab />);
    });
  };

  it("shows Blockfrost rate-limit error instead of sync label when history returns blockfrost_rate_limited", async () => {
    mockSendMessage.mockImplementation((_port: unknown, msg: unknown) => {
      if (msg instanceof GetCardanoTxHistoryMsg) {
        return Promise.resolve({
          state: "blockfrost_rate_limited",
          items: [],
          mightHaveMore: false,
          error: "Rate limit exceeded",
        });
      }
      return Promise.resolve({
        state: "ready_with_data",
        isSettled: true,
      });
    });

    renderTab();
    await flushMicrotasks();

    expect(container.textContent).not.toContain(SYNC_LABEL);
    expect(container.textContent).toMatch(/Blockfrost API key usage limit/i);
  });

  it("shows sync label when history returns syncing", async () => {
    mockSendMessage.mockImplementation((_port: unknown, msg: unknown) => {
      if (msg instanceof GetCardanoTxHistoryMsg) {
        return Promise.resolve({
          state: "syncing",
          items: [],
          mightHaveMore: false,
          error: "wallet_sync_in_progress",
        });
      }
      return Promise.resolve({
        state: "syncing",
        isSettled: false,
      });
    });

    renderTab();
    await flushMicrotasks();

    expect(container.textContent).toContain(SYNC_LABEL);
  });
});
