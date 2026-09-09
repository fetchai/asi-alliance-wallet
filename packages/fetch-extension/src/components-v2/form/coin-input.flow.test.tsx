import React from "react";
import { act, Simulate } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import { CoinInput, TokenSelectorDropdown } from "./coin-input";

jest.mock("mobx-react-lite", () => ({
  observer: (component: unknown) => component,
}));

jest.mock("@keplr-wallet/hooks", () => {
  class EmptyAmountError extends Error {}
  class InvalidNumberAmountError extends Error {}
  class ZeroAmountError extends Error {}
  class NegativeAmountError extends Error {}
  class InsufficientAmountError extends Error {}
  class BridgeAmountError extends Error {}

  return {
    EmptyAmountError,
    InvalidNumberAmountError,
    ZeroAmountError,
    NegativeAmountError,
    InsufficientAmountError,
    BridgeAmountError,
  };
});

jest.mock("react-intl", () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
}));

jest.mock("../card", () => ({
  Card: (props: {
    heading?: React.ReactNode;
    subheading?: React.ReactNode;
    rightContent?: React.ReactNode;
    onClick?: () => void;
  }) => (
    <div data-testid="card" onClick={() => props.onClick?.()}>
      <div>{props.heading}</div>
      <div>{props.subheading}</div>
      <div data-testid="card-right-content">{props.rightContent}</div>
    </div>
  ),
}));

jest.mock("../dropdown", () => ({
  Dropdown: (props: { isOpen: boolean; children: React.ReactNode }) =>
    props.isOpen ? <div data-testid="dropdown">{props.children}</div> : null,
}));

const mockStore = {
  priceStore: {
    supportedVsCurrencies: {
      usd: { currency: "usd" },
    },
    calculatePrice: jest.fn(() => ({
      shrink: () => ({
        maxDecimals: () => ({
          toString: () => "0.000999999",
        }),
      }),
    })),
    getPrice: jest.fn(() => 1),
  },
  queriesStore: {
    get: jest.fn(() => ({
      queryBalances: {
        getQueryBech32Address: () => ({
          balances: [
            {
              currency: {
                coinDenom: "ATOM",
                coinDecimals: 18,
                coinMinimalDenom: "uatom",
              },
              balance: {
                toDec: () => ({ toString: () => "0.000999999" }),
              },
            },
          ],
          getBalanceFromCurrency: () => ({
            toDec: () => ({
              isZero: () => false,
            }),
          }),
        }),
      },
    })),
  },
  accountStore: {
    getAccount: () => ({
      bech32Address: "cosmos1sender",
    }),
  },
  chainStore: {
    current: {
      chainId: "cardano-testnet",
      features: ["cardano"],
    },
  },
  analyticsStore: {
    logEvent: jest.fn(),
  },
};

jest.mock("../../stores", () => ({
  useStore: () => mockStore,
}));

jest.mock("../../languages", () => ({
  useLanguage: () => ({ fiatCurrency: "usd" }),
}));

describe("CoinInput display formatting behavior", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalCrypto = globalThis.crypto;

  beforeEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: {
        getRandomValues: (arr: Uint8Array) => arr.fill(1),
      },
      configurable: true,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      configurable: true,
    });
    jest.clearAllMocks();
  });

  const renderCoinInput = (amountConfig: any) => {
    act(() => {
      root.render(
        <CoinInput
          amountConfig={amountConfig}
          showAllBalance={false}
          disableAllBalance={false}
        />
      );
    });
  };

  it("keeps token input raw while focused and formatted on blur", async () => {
    const amountConfig = {
      amount: "0.000999999",
      error: undefined,
      setAmount: jest.fn(),
      toggleIsMax: jest.fn(),
      sendCurrency: {
        coinDenom: "ATOM",
        coinDecimals: 18,
        coinMinimalDenom: "uatom",
      },
    };

    renderCoinInput(amountConfig);

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("0.001");

    await act(async () => {
      Simulate.focus(input);
    });
    expect(input.value).toBe("0.000999999");

    await act(async () => {
      Simulate.blur(input);
    });
    expect(input.value).toBe("0.001");
  });

  it("keeps fiat input raw while focused and formatted on blur", async () => {
    const amountConfig = {
      amount: "0.000999999",
      error: undefined,
      setAmount: jest.fn(),
      toggleIsMax: jest.fn(),
      sendCurrency: {
        coinDenom: "ATOM",
        coinDecimals: 18,
        coinMinimalDenom: "uatom",
        coinGeckoId: "cosmos",
      },
    };

    renderCoinInput(amountConfig);

    const toggleButton = [...container.querySelectorAll("button")].find((btn) =>
      btn.textContent?.includes("Change to")
    ) as HTMLButtonElement;

    await act(async () => {
      toggleButton.click();
    });

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("0.001");

    await act(async () => {
      Simulate.focus(input);
    });
    expect(input.value).toBe("0.000999999");

    await act(async () => {
      Simulate.blur(input);
    });
    expect(input.value).toBe("0.001");
  });

  it("use max keeps amount state ownership in amountConfig", async () => {
    const amountConfig = {
      amount: "1",
      error: undefined,
      setAmount: jest.fn(),
      toggleIsMax: jest.fn(),
      sendCurrency: {
        coinDenom: "ATOM",
        coinDecimals: 6,
        coinMinimalDenom: "uatom",
      },
    };

    renderCoinInput(amountConfig);

    const useMaxButton = [...container.querySelectorAll("button")].find((btn) =>
      btn.textContent?.includes("Use max")
    ) as HTMLButtonElement;
    expect(useMaxButton).toBeDefined();

    await act(async () => {
      useMaxButton.click();
    });

    expect(amountConfig.toggleIsMax).toHaveBeenCalledTimes(1);
    expect(amountConfig.setAmount).not.toHaveBeenCalled();
  });

  it("formats available and dropdown balances in token selector", async () => {
    const amountConfig = {
      chainId: "cardano-testnet",
      sender: "cosmos1sender",
      sendCurrency: {
        coinDenom: "ATOM",
        coinDecimals: 18,
        coinMinimalDenom: "uatom",
      },
      setSendCurrency: jest.fn(),
    };

    act(() => {
      root.render(<TokenSelectorDropdown amountConfig={amountConfig as any} />);
    });

    expect(container.textContent).toContain("Available: 0.001");
    expect(container.textContent).not.toContain("Available: 0.000999999");

    const selectorCard = container.querySelector(
      "[data-testid='card']"
    ) as HTMLElement;
    await act(async () => {
      selectorCard.click();
    });

    const rightContents = [
      ...container.querySelectorAll("[data-testid='card-right-content']"),
    ].map((el) => el.textContent ?? "");
    expect(rightContents.some((text) => text.includes("0.001"))).toBe(true);
    expect(rightContents.some((text) => text.includes("0.000999999"))).toBe(
      false
    );
  });
});
