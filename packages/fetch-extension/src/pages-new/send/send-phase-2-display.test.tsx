import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import { SendPhase2 } from "./send-phase-2";
import { CoinPretty, Int } from "@keplr-wallet/unit";

jest.mock("mobx-react-lite", () => ({
  observer: (component: unknown) => component,
}));

jest.mock("@keplr-wallet/stores", () => ({
  CARDANO_NATIVE_TOKEN_TYPE: "native",
}));

jest.mock("@keplr-wallet/hooks", () => ({
  EmptyAddressError: class EmptyAddressError extends Error {},
}));

jest.mock("@keplr-wallet/cardano", () => ({
  lovelacesToAdaString: (lovelaces: string) => String(lovelaces),
  CardanoUiErrorCode: {},
  parseCardanoUiError: (message: string) => ({ message }),
}));

const mockNavigate = jest.fn();
const mockSendMessage = jest.fn();

/** Must match `recipient` / `rawRecipient` in self-send warning tests. */
const MOCK_ACCOUNT_BECH32 = "addr_test1q...";

const mockStore = {
  chainStore: {
    current: {
      chainId: "cardano-testnet",
      chainName: "Cardano Testnet",
      features: ["cardano"],
      stakeCurrency: {
        coinDenom: "tADA",
        coinDecimals: 6,
      },
    },
  },
  accountStore: {
    getAccount: () => ({
      bech32Address: MOCK_ACCOUNT_BECH32,
      ethereumHexAddress: "0xabc",
      txInProgress: "send",
      isReadyToSendMsgs: true,
      isSendingMsg: "",
      makeSendTokenTx: () => ({ send: jest.fn() }),
    }),
  },
  priceStore: {
    calculatePrice: () => ({
      shrink: () => ({ maxDecimals: () => ({ toString: () => "0" }) }),
    }),
  },
  analyticsStore: {
    logEvent: jest.fn(),
  },
  activityStore: {
    getPendingTxnTypes: {},
  },
  keyRingStore: {
    keyRingType: "mnemonic",
    status: "unlocked",
    unlock: jest.fn(),
  },
};

jest.mock("../../stores", () => ({
  useStore: () => mockStore,
}));

jest.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: {} }),
}));

jest.mock("../../languages", () => ({
  useLanguage: () => ({ fiatCurrency: "usd" }),
}));

jest.mock("../../hooks", () => ({
  useNetwork: () => ({ isOnline: true }),
}));

jest.mock("react-intl", () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
}));

jest.mock("@components/notification", () => ({
  useNotification: () => ({ push: jest.fn() }),
}));

jest.mock("@utils/pathname", () => ({
  getPathname: () => "send",
}));

jest.mock("../../config", () => ({
  TXNTYPE: { send: "send" },
}));

jest.mock("@components-v2/form/fee-buttons-v2", () => ({
  FeeButtons: () => null,
}));

jest.mock("@components-v2/form", () => ({
  AddressInput: (props: { warningText?: string }) =>
    props.warningText ? (
      <div data-testid="address-input-warning">{props.warningText}</div>
    ) : null,
  MemoInput: () => null,
  PasswordInput: React.forwardRef(function PasswordInputMock(
    _props: Record<string, unknown>,
    ref: React.Ref<HTMLInputElement>
  ) {
    return <input ref={ref} data-testid="password-input" />;
  }),
}));

jest.mock("@components-v2/buttons/button", () => ({
  ButtonV2: (props: {
    onClick?: (e: React.MouseEvent) => void;
    text?: string;
    type?: "button" | "submit";
    disabled?: boolean;
    children?: React.ReactNode;
  }) => (
    <button
      type={props.type ?? "button"}
      onClick={(e) => props.onClick?.(e)}
      disabled={props.disabled}
    >
      {props.text ?? props.children}
    </button>
  ),
}));

jest.mock("reactstrap", () => ({
  Modal: (props: { isOpen: boolean; children: React.ReactNode }) =>
    props.isOpen ? (
      <div data-testid="password-modal">{props.children}</div>
    ) : null,
  ModalBody: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
}));

jest.mock("@components-v2/transx-status", () => ({
  TransxStatus: () => null,
}));

jest.mock("@keplr-wallet/router-extension", () => ({
  InExtensionMessageRequester: class {
    sendMessage(...args: unknown[]) {
      return mockSendMessage(...args);
    }
  },
}));

jest.mock("@keplr-wallet/background", () => {
  class SubmitSendAdaTxDraftMsg {
    constructor() {
      return;
    }
  }
  class SubmitSendAdaTxDraftWithPasswordMsg {
    constructor() {
      return;
    }
  }
  class BuildSendAdaTxDraftMsg {
    constructor() {
      return;
    }
  }
  class DiscardSendAdaTxDraftMsg {
    constructor() {
      return;
    }
  }
  class GetCardanoSyncStatusMsg {
    constructor() {
      return;
    }
  }
  return {
    SubmitSendAdaTxDraftMsg,
    SubmitSendAdaTxDraftWithPasswordMsg,
    BuildSendAdaTxDraftMsg,
    DiscardSendAdaTxDraftMsg,
    GetCardanoSyncStatusMsg,
    KeyRingStatus: { LOCKED: "locked" },
  };
});

const makeSendConfigs = (overrides?: {
  recipient?: string;
  rawRecipient?: string;
  recipientError?: Error;
}) => ({
  recipientConfig: {
    recipient: overrides?.recipient ?? "addr_test1recipient",
    rawRecipient: overrides?.rawRecipient ?? "addr_test1recipient",
    error: overrides?.recipientError as Error | undefined,
    setRawRecipient: jest.fn(),
  },
  amountConfig: {
    amount: "0.000999999",
    error: undefined,
    setAmount: jest.fn(),
    setSendCurrency: jest.fn(),
    sendCurrency: {
      coinDenom: "tADA",
      coinDecimals: 18,
      coinMinimalDenom: "ulovelace",
    },
  },
  memoConfig: {
    memo: "",
    error: undefined,
    setMemo: jest.fn(),
  },
  gasConfig: {
    error: undefined,
  },
  feeConfig: {
    error: undefined,
    feeType: "average",
    fee: new CoinPretty(
      {
        coinDenom: "tADA",
        coinMinimalDenom: "ulovelace",
        coinDecimals: 6,
      },
      new Int("170000")
    ),
    toStdFee: jest.fn(),
  },
});

const flushDeep = async (rounds = 8) => {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
};

describe("SendPhase2 display formatting regression", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockNavigate.mockReset();
    mockSendMessage.mockReset();
    mockSendMessage.mockImplementation(
      (_port: unknown, msg: { constructor?: { name?: string } }) => {
        const name = msg?.constructor?.name;
        if (name === "GetCardanoSyncStatusMsg") {
          return Promise.resolve({
            state: "ready_with_data",
            isSettled: true,
          });
        }
        if (name === "BuildSendAdaTxDraftMsg") {
          return Promise.resolve({
            kind: "draft",
            draftId: "draft-id",
            fee: "170000",
            total: "1230000",
          });
        }
        if (name === "DiscardSendAdaTxDraftMsg") {
          return Promise.resolve(undefined);
        }
        return Promise.resolve("ok");
      }
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    jest.useRealTimers();
  });

  it("shows formatted amount in review card and in cardano modal summary", async () => {
    const sendConfigs = makeSendConfigs();

    act(() => {
      root.render(
        <SendPhase2
          sendConfigs={sendConfigs}
          isDetachedPage={false}
          setIsNext={jest.fn()}
          trnsxStatus={undefined as any}
          fromPhase1={false}
          configs={undefined}
          balance={
            new CoinPretty(
              {
                coinDenom: "ATOM",
                coinMinimalDenom: "uatom",
                coinDecimals: 6,
                coinGeckoId: "cosmos",
                coinImageUrl:
                  "https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.png",
              },
              new Int(0)
            )
          }
          setFromPhase1={jest.fn()}
          gasSimulator={undefined}
        />
      );
    });

    const advanceDraftBuild = async () => {
      await act(async () => {
        await flushDeep();
      });
      await act(async () => {
        jest.advanceTimersByTime(350);
        await flushDeep();
      });
    };

    await advanceDraftBuild();

    await act(async () => {
      await flushDeep();
    });

    expect(container.textContent).toContain("0.001 tADA");
    expect(container.textContent).not.toContain("0.000999999 tADA");

    const reviewButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Review Transaction")
    ) as HTMLButtonElement;
    expect(reviewButton).toBeDefined();
    expect(reviewButton.disabled).toBe(false);

    await act(async () => {
      reviewButton.click();
      await flushDeep();
    });

    const modal = container.querySelector(
      "[data-testid='password-modal']"
    ) as HTMLElement | null;
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain("0.001 tADA");
    expect(modal?.textContent).not.toContain("0.000999999 tADA");
  });

  it("passes self-send warningText to AddressInput when recipient matches account and has no recipient error", async () => {
    const sendConfigs = makeSendConfigs({
      recipient: MOCK_ACCOUNT_BECH32,
      rawRecipient: MOCK_ACCOUNT_BECH32,
    });

    act(() => {
      root.render(
        <SendPhase2
          sendConfigs={sendConfigs}
          isDetachedPage={false}
          setIsNext={jest.fn()}
          trnsxStatus={undefined as any}
          fromPhase1={false}
          configs={undefined}
          balance={
            new CoinPretty(
              {
                coinDenom: "ATOM",
                coinMinimalDenom: "uatom",
                coinDecimals: 6,
                coinGeckoId: "cosmos",
                coinImageUrl:
                  "https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.png",
              },
              new Int(0)
            )
          }
          setFromPhase1={jest.fn()}
          gasSimulator={undefined}
        />
      );
    });

    await act(async () => {
      await flushDeep();
    });

    const warning = container.querySelector(
      "[data-testid='address-input-warning']"
    );
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toBe("send.self-send-warning");
  });

  it("does not pass self-send warningText when recipient matches account but recipient has an error", async () => {
    const sendConfigs = makeSendConfigs({
      recipient: MOCK_ACCOUNT_BECH32,
      rawRecipient: MOCK_ACCOUNT_BECH32,
      recipientError: new Error("invalid recipient"),
    });

    act(() => {
      root.render(
        <SendPhase2
          sendConfigs={sendConfigs}
          isDetachedPage={false}
          setIsNext={jest.fn()}
          trnsxStatus={undefined as any}
          fromPhase1={false}
          configs={undefined}
          balance={
            new CoinPretty(
              {
                coinDenom: "ATOM",
                coinMinimalDenom: "uatom",
                coinDecimals: 6,
                coinGeckoId: "cosmos",
                coinImageUrl:
                  "https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.png",
              },
              new Int(0)
            )
          }
          setFromPhase1={jest.fn()}
          gasSimulator={undefined}
        />
      );
    });

    await act(async () => {
      await flushDeep();
    });

    expect(
      container.querySelector("[data-testid='address-input-warning']")
    ).toBeNull();
  });
});
