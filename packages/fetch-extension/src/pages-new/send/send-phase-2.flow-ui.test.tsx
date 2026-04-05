/** @jest-environment jsdom */

import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import { SendPhase2 } from "./send-phase-2";

const mockNavigate = jest.fn();
const mockNotificationPush = jest.fn();
const mockGetPathname = jest.fn(() => "send");
const mockSendMessage = jest.fn();
let mockLocationState: Record<string, unknown> = {};

jest.mock("mobx-react-lite", () => ({
  observer: (component: unknown) => component,
}));

jest.mock("../../stores", () => ({
  useStore: () => mockStore,
}));

jest.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
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
  useNotification: () => ({ push: mockNotificationPush }),
}));

jest.mock("@utils/pathname", () => ({
  getPathname: () => mockGetPathname(),
}));

jest.mock("@components-v2/form/fee-buttons-v2", () => ({
  FeeButtons: () => null,
}));

jest.mock("@components-v2/form", () => ({
  AddressInput: () => null,
  MemoInput: () => null,
  PasswordInput: React.forwardRef(
    (
      props: {
        value: string;
        onChange: (event: { target: { value: string } }) => void;
        error?: string;
      },
      ref: React.Ref<HTMLInputElement>
    ) => (
      <div>
        <input
          ref={ref}
          value={props.value}
          onChange={(e) => props.onChange({ target: { value: e.target.value } })}
          data-testid="password-input"
        />
        {props.error ? (
          <div data-testid="password-error">{props.error}</div>
        ) : null}
      </div>
    )
  ),
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
    props.isOpen ? <div data-testid="password-modal">{props.children}</div> : null,
  ModalBody: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}));

jest.mock("@components-v2/transx-status", () => ({
  TransxStatus: ({ status }: { status: string }) => {
    if (status === "success") {
      return <div data-testid="tx-status">Transaction Successful</div>;
    }
    return <div data-testid="tx-status">{status}</div>;
  },
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
    constructor(
      public readonly draftId: string,
      public readonly chainId?: string
    ) {}
  }
  class SubmitSendAdaTxDraftWithPasswordMsg {
    constructor(
      public readonly draftId: string,
      public readonly password: string,
      public readonly chainId?: string
    ) {}
  }
  class BuildSendAdaTxDraftMsg {
    constructor() {}
  }
  class DiscardSendAdaTxDraftMsg {
    constructor() {}
  }
  class GetCardanoSyncStatusMsg {
    constructor() {}
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

const defaultCardanoAccount = () => ({
  bech32Address: "addr_test1q...",
  ethereumHexAddress: "0xabc",
  txInProgress: "send",
  isReadyToSendMsgs: true,
  isSendingMsg: "",
  makeSendTokenTx: () => ({
    send: jest.fn(),
  }),
});

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
    getAccount: defaultCardanoAccount,
  },
  priceStore: {
    calculatePrice: () => ({ shrink: () => ({ maxDecimals: () => ({ toString: () => "0" }) }) }),
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

const sendConfigs = {
  recipientConfig: {
    recipient: "addr_test1recipient",
    rawRecipient: "addr_test1recipient",
    error: undefined,
    setRawRecipient: jest.fn(),
  },
  amountConfig: {
    amount: "1.23",
    error: undefined,
    setAmount: jest.fn(),
    setSendCurrency: jest.fn(),
    sendCurrency: {
      coinDenom: "tADA",
      coinDecimals: 6,
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
    fee: { toString: () => "0.17 tADA" },
    toStdFee: jest.fn(),
  },
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
};

describe("SendPhase2 real flow guards", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockNavigate.mockReset();
    mockNotificationPush.mockReset();
    mockSendMessage.mockReset();
    mockGetPathname.mockReset();
    mockLocationState = {};
    mockStore.accountStore.getAccount = defaultCardanoAccount;
    mockGetPathname.mockReturnValue("send");
    mockSendMessage.mockResolvedValue({
      state: "ready_with_data",
      isSettled: true,
      draftId: "draft-id",
      fee: "170000",
      total: "1230000",
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    jest.useRealTimers();
  });

  const renderComponent = (props?: {
    trnsxStatus?: string;
    isCardano?: boolean;
    /** When set, used instead of default cardano-testnet / cosmoshub-4 (e.g. poll effect deps). */
    chainId?: string;
  }) => {
    const isCardano = props?.isCardano ?? true;
    const chainId =
      props?.chainId ??
      (isCardano ? "cardano-testnet" : "cosmoshub-4");
    mockStore.chainStore.current = {
      chainId,
      chainName: isCardano ? "Cardano Testnet" : "Cosmos Hub",
      features: isCardano ? ["cardano"] : [],
      stakeCurrency: {
        coinDenom: isCardano ? "tADA" : "ATOM",
        coinDecimals: 6,
      },
    };
    act(() => {
      root.render(
        <SendPhase2
          sendConfigs={sendConfigs}
          isDetachedPage={false}
          setIsNext={jest.fn()}
          trnsxStatus={props?.trnsxStatus as any}
          fromPhase1={false}
          configs={undefined}
          setFromPhase1={jest.fn()}
          gasSimulator={undefined}
        />
      );
    });
  };

  const advanceDraftBuild = async () => {
    await act(async () => {
      jest.advanceTimersByTime(350);
      await flushMicrotasks();
    });
  };

  it("keeps modal open and shows inline error for modal-level failure", async () => {
    renderComponent();
    await advanceDraftBuild();

    const reviewButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Review Transaction")
    ) as HTMLButtonElement;
    act(() => {
      reviewButton.click();
    });

    const input = container.querySelector("[data-testid='password-input']") as HTMLInputElement;
    act(() => {
      input.value = "bad-password";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    mockSendMessage.mockRejectedValueOnce(
      new Error("cardano_ui_error:invalid_password:Invalid password")
    );

    const confirmButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Confirm")
    ) as HTMLButtonElement;
    await act(async () => {
      confirmButton.click();
    });

    expect(container.querySelector("[data-testid='password-modal']")).not.toBeNull();
    expect(container.querySelector("[data-testid='password-error']")?.textContent).toContain(
      "Invalid password"
    );
    expect(
      mockNavigate.mock.calls.some(
        (call) => call[0] === "/send" && call[1]?.state?.trnsxStatus === "failed"
      )
    ).toBe(false);
    const sendNavCallsAfterModalError = mockNavigate.mock.calls.filter(
      (call) => call[0] === "/send"
    );
    expect(
      sendNavCallsAfterModalError.some(
        (call) => call[1]?.state?.trnsxStatus === "pending"
      )
    ).toBe(false);
    expect(
      sendNavCallsAfterModalError.some(
        (call) => call[1]?.state?.trnsxStatus === "success"
      )
    ).toBe(false);
    expect(
      mockNotificationPush.mock.calls.some(
        (call) =>
          call[0]?.type === "warning" &&
          typeof call[0]?.content === "string" &&
          call[0].content.includes("Transaction Failed")
      )
    ).toBe(false);
  });

  it("goes to failed flow for system-level failure", async () => {
    renderComponent();
    await advanceDraftBuild();

    const reviewButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Review Transaction")
    ) as HTMLButtonElement;
    act(() => {
      reviewButton.click();
    });

    const input = container.querySelector("[data-testid='password-input']") as HTMLInputElement;
    act(() => {
      input.value = "ok-password";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    mockSendMessage.mockRejectedValueOnce(new Error("submit tx failed: provider unavailable"));

    const confirmButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Confirm")
    ) as HTMLButtonElement;
    await act(async () => {
      confirmButton.click();
    });

    expect(
      mockNavigate.mock.calls.some(
        (call) => call[0] === "/send" && call[1]?.state?.trnsxStatus === "failed"
      )
    ).toBe(true);
  });

  it("navigates pending then success once and renders routed success screen", async () => {
    renderComponent();
    await advanceDraftBuild();

    const reviewButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Review Transaction")
    ) as HTMLButtonElement;
    act(() => {
      reviewButton.click();
    });

    const input = container.querySelector("[data-testid='password-input']") as HTMLInputElement;
    act(() => {
      input.value = "good-password";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    mockSendMessage.mockResolvedValueOnce("tx-id-1");

    const confirmButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Confirm")
    ) as HTMLButtonElement;
    await act(async () => {
      confirmButton.click();
    });

    expect(
      mockNavigate.mock.calls.some(
        (call) => call[0] === "/send" && call[1]?.state?.trnsxStatus === "pending"
      )
    ).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(350);
      await flushMicrotasks();
    });

    const successCalls = mockNavigate.mock.calls.filter(
      (call) => call[0] === "/send" && call[1]?.state?.trnsxStatus === "success"
    );
    expect(successCalls.length).toBe(1);
    expect(mockNavigate.mock.calls.some((call) => call[0] === "/")).toBe(false);

    const successRouteState = successCalls[0]?.[1]?.state;
    expect(successRouteState).toBeDefined();
    // Routed success roundtrip: feed captured navigate state back into useLocation + rerender with
    // trnsxStatus from that same object (not a standalone literal success prop).

    mockLocationState = successRouteState as Record<string, unknown>;
    renderComponent({
      trnsxStatus: (successRouteState as { trnsxStatus: string }).trnsxStatus,
    });
    expect(container.textContent).toContain("Transaction Successful");
  });

  it("non-cardano minimal smoke: no password modal, send runs, pending navigation (success needs onFulfill)", async () => {
    // mockResolvedValue does not invoke tx.send's onBroadcasted/onFulfill; real success navigates
    // only from onFulfill. After await send, SendPhase2 navigates to pending — that is the
    // honest outcome for this stub.
    const nonCardanoSend = jest.fn().mockResolvedValue("non-cardano-tx-hash");
    mockStore.accountStore.getAccount = () => ({
      bech32Address: "cosmos1test",
      ethereumHexAddress: "0xabc",
      txInProgress: "send",
      isReadyToSendMsgs: true,
      isSendingMsg: "",
      makeSendTokenTx: () => ({
        send: nonCardanoSend,
      }),
    });

    renderComponent({ isCardano: false });

    const reviewButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Review Transaction")
    ) as HTMLButtonElement;
    await act(async () => {
      reviewButton.click();
      await flushMicrotasks();
    });

    expect(container.querySelector("[data-testid='password-modal']")).toBeNull();
    expect(nonCardanoSend).toHaveBeenCalled();
    expect(
      mockNavigate.mock.calls.some(
        (call) => call[0] === "/send" && call[1]?.state?.trnsxStatus === "pending"
      )
    ).toBe(true);
    expect(
      mockNavigate.mock.calls.some(
        (call) => call[0] === "/send" && call[1]?.state?.trnsxStatus === "success"
      )
    ).toBe(false);
  });

  it("non-cardano invokes onFulfill: success navigation (and post-await pending)", async () => {
    const nonCardanoSend = jest.fn(
      async (
        _stdFee: unknown,
        _memo: unknown,
        _signOptions: unknown,
        callbacks?: { onFulfill?: (tx: { code?: number }) => void }
      ) => {
        callbacks?.onFulfill?.({ code: 0 });
      }
    );
    mockStore.accountStore.getAccount = () => ({
      bech32Address: "cosmos1test",
      ethereumHexAddress: "0xabc",
      txInProgress: "send",
      isReadyToSendMsgs: true,
      isSendingMsg: "",
      makeSendTokenTx: () => ({
        send: nonCardanoSend,
      }),
    });

    renderComponent({ isCardano: false });

    const reviewButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Review Transaction")
    ) as HTMLButtonElement;
    await act(async () => {
      reviewButton.click();
      await flushMicrotasks();
    });

    expect(nonCardanoSend).toHaveBeenCalled();
    expect(
      mockNavigate.mock.calls.some(
        (call) => call[0] === "/send" && call[1]?.state?.trnsxStatus === "success"
      )
    ).toBe(true);
    expect(
      mockNavigate.mock.calls.some(
        (call) => call[0] === "/send" && call[1]?.state?.trnsxStatus === "pending"
      )
    ).toBe(true);
  });

  describe("Cardano sync polling recovery", () => {
    type SyncQueueItem = "reject" | { state: string; isSettled?: boolean };

    let syncQueue: SyncQueueItem[];

    const countGetCardanoSyncStatusCalls = (): number =>
      mockSendMessage.mock.calls.filter(
        (call) =>
          (call[1] as { constructor?: { name?: string } } | undefined)?.constructor
            ?.name === "GetCardanoSyncStatusMsg"
      ).length;

    const bottomActionButton = (): HTMLButtonElement | undefined =>
      [...container.querySelectorAll("button")].find(
        (b) =>
          b.textContent?.includes("Review Transaction") ||
          b.textContent?.includes("Syncing wallet")
      ) as HTMLButtonElement | undefined;

    beforeEach(() => {
      syncQueue = [];
      mockSendMessage.mockImplementation(
        (_port: unknown, msg: { constructor?: { name?: string } }) => {
          const name = msg?.constructor?.name;
          if (name === "GetCardanoSyncStatusMsg") {
            const item = syncQueue.shift();
            if (item === "reject") {
              return Promise.reject(new Error("GetCardanoSyncStatusMsg ipc fail"));
            }
            if (item == null) {
              return Promise.reject(new Error("sync queue exhausted"));
            }
            return Promise.resolve(item);
          }
          if (name === "BuildSendAdaTxDraftMsg") {
            return Promise.resolve({
              draftId: "draft-id",
              fee: "170000",
              total: "1230000",
            });
          }
          if (name === "DiscardSendAdaTxDraftMsg") {
            return Promise.resolve(undefined);
          }
          return Promise.resolve("tx-ok");
        }
      );
    });

    const runDraftDebounce = async () => {
      await act(async () => {
        jest.advanceTimersByTime(350);
        await flushMicrotasks();
      });
    };

    it("recovers after GetCardanoSyncStatusMsg reject then success; poll stops after ready", async () => {
      syncQueue = ["reject", { state: "ready_with_data", isSettled: true }];
      renderComponent();
      await act(async () => {
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(1);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(2);

      await runDraftDebounce();

      const btn = bottomActionButton();
      expect(btn?.textContent).toContain("Review Transaction");
      expect(btn?.disabled).toBe(false);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(2);
    });

    it("recovers after provider_error then success; poll stops after ready", async () => {
      syncQueue = [
        { state: "provider_error", isSettled: false },
        { state: "ready_with_data", isSettled: true },
      ];
      renderComponent();
      await act(async () => {
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(1);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(2);

      await runDraftDebounce();

      const btn = bottomActionButton();
      expect(btn?.textContent).toContain("Review Transaction");
      expect(btn?.disabled).toBe(false);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(2);
    });

    it("reject after provider_error keeps last known-good sync UI (catch must not fake syncing)", async () => {
      syncQueue = [
        { state: "provider_error", isSettled: false },
        "reject",
        { state: "ready_with_data", isSettled: true },
      ];
      renderComponent();
      await act(async () => {
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(1);

      await runDraftDebounce();

      let btn = bottomActionButton();
      expect(btn?.textContent).toContain("Review Transaction");
      expect(btn?.textContent).not.toContain("Syncing wallet");
      expect(container.textContent).not.toMatch(/Syncing Cardano wallet/i);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(2);

      btn = bottomActionButton();
      expect(btn?.textContent).toContain("Review Transaction");
      expect(btn?.textContent).not.toContain("Syncing wallet");
      expect(container.textContent).not.toMatch(/Syncing Cardano wallet/i);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(3);

      await runDraftDebounce();

      btn = bottomActionButton();
      expect(btn?.textContent).toContain("Review Transaction");
      expect(btn?.disabled).toBe(false);
    });

    it("temporarily_unavailable (successful body) keeps isCardanoSyncing and poll non-terminal until ready", async () => {
      syncQueue = [
        { state: "temporarily_unavailable", isSettled: false },
        { state: "temporarily_unavailable", isSettled: false },
        { state: "ready_with_data", isSettled: true },
      ];
      renderComponent();
      await act(async () => {
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(1);

      let btn = bottomActionButton();
      expect(btn?.textContent).toContain("Syncing wallet");
      expect(btn?.disabled).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(2);

      btn = bottomActionButton();
      expect(btn?.textContent).toContain("Syncing wallet");
      expect(btn?.disabled).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(3);

      await runDraftDebounce();

      btn = bottomActionButton();
      expect(btn?.textContent).toContain("Review Transaction");
      expect(btn?.disabled).toBe(false);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(3);
    });

    it("does not make sync poll terminal after GetCardanoSyncStatusMsg reject", async () => {
      syncQueue = [
        "reject",
        "reject",
        { state: "ready_with_data", isSettled: true },
      ];
      renderComponent();
      await act(async () => {
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(1);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(2);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(3);

      await runDraftDebounce();

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(3);
    });

    it("does not make sync poll terminal after provider_error", async () => {
      syncQueue = [
        { state: "provider_error", isSettled: false },
        { state: "provider_error", isSettled: false },
        { state: "ready_with_data", isSettled: true },
      ];
      renderComponent();
      await act(async () => {
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(1);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(2);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(3);

      await runDraftDebounce();

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(3);
    });

    it("after prior ready (poll stopped), chainId change restarts sync effect; reject then ready recovers", async () => {
      syncQueue = [{ state: "ready_with_data", isSettled: true }];
      renderComponent({ chainId: "cardano-chain-a" });
      await act(async () => {
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(1);

      syncQueue = ["reject", { state: "ready_with_data", isSettled: true }];
      await act(async () => {
        renderComponent({ chainId: "cardano-chain-b" });
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(2);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(3);

      await runDraftDebounce();

      const btn = bottomActionButton();
      expect(btn?.textContent).toContain("Review Transaction");
      expect(btn?.disabled).toBe(false);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(3);
    });
  });
});
