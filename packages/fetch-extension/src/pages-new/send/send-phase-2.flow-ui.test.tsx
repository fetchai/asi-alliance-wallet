import React from "react";
import { act, Simulate } from "react-dom/test-utils";
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

jest.mock("@keplr-wallet/stores", () => ({
  // Must match packages/stores (cardanonative); "native" wrongly flags ADA as token dust before Build.
  CARDANO_NATIVE_TOKEN_TYPE: "cardanonative",
}));

jest.mock("@keplr-wallet/hooks", () => ({
  EmptyAddressError: class EmptyAddressError extends Error {
    override readonly name = "EmptyAddressError";
  },
}));

jest.mock("@keplr-wallet/cardano", () => ({
  lovelacesToAdaString: (lovelaces: string) => String(lovelaces),
  mapCardanoMinimumViolation: ({
    minimumOutputLovelace,
    coinMissingLovelace,
  }: {
    minimumOutputLovelace: string;
    coinMissingLovelace?: string;
  }) =>
    /^\d+$/.test(minimumOutputLovelace) && BigInt(minimumOutputLovelace) > BigInt(0)
      ? {
          classification: "minimum_violation",
          minimumOutputLovelace,
          coinMissingLovelace:
            coinMissingLovelace && /^\d+$/.test(coinMissingLovelace)
              ? coinMissingLovelace
              : undefined,
        }
      : null,
  formatCardanoMinimumViolationMessage: ({
    violation,
    cardanoDenom,
    nativeAdaCoinDecimals,
  }: {
    violation: { minimumOutputLovelace: string };
    cardanoDenom: string;
    nativeAdaCoinDecimals: number;
  }) => {
    const raw = String(violation.minimumOutputLovelace).padStart(
      nativeAdaCoinDecimals + 1,
      "0"
    );
    const whole = raw.slice(0, -nativeAdaCoinDecimals);
    const frac = raw.slice(-nativeAdaCoinDecimals).replace(/0+$/, "");
    const amount = frac ? `${whole}.${frac}` : whole;
    return `Amount too small. Minimum required is ${amount} ${cardanoDenom}`;
  },
  CardanoUiErrorCode: {},
  parseCardanoUiError: (message: string) => {
    const prefix = "cardano_ui_error:";
    if (message.startsWith(prefix)) {
      const rest = message.slice(prefix.length);
      const colon = rest.indexOf(":");
      if (colon >= 0) {
        return {
          code: rest.slice(0, colon),
          message: rest.slice(colon + 1),
        };
      }
    }
    return { message };
  },
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
  useNetwork: jest.fn(() => ({ isOnline: true })),
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

jest.mock("../../config", () => ({
  TXNTYPE: {
    send: "send",
  },
}));

jest.mock("@components-v2/form/fee-buttons-v2", () => ({
  FeeButtons: () => null,
}));

jest.mock("@components-v2/form", () => ({
  AddressInput: () => null,
  MemoInput: () => null,
  PasswordInput: React.forwardRef(function MockPasswordInput(
    props: {
      value: string;
      onChange: (event: { target: { value: string } }) => void;
      error?: string;
    },
    ref: React.Ref<HTMLInputElement>
  ) {
    return (
      <div>
        <input
          ref={ref}
          value={props.value}
          onChange={(e) =>
            props.onChange({ target: { value: e.target.value } })
          }
          data-testid="password-input"
        />
        {props.error ? (
          <div data-testid="password-error">{props.error}</div>
        ) : null}
      </div>
    );
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
  TransxStatus: ({ status }: { status: string }) => {
    if (status === "success") {
      return <div data-testid="tx-status">Transaction Successful</div>;
    }
    if (status === "pending") {
      return <div data-testid="tx-status">Transaction Pending</div>;
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
    /* mock stub */
    constructor() {
      return;
    }
  }
  class DiscardSendAdaTxDraftMsg {
    constructor(public readonly draftId?: string) {}
  }
  class GetCardanoSyncStatusMsg {
    constructor(public chainId?: string) {}
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

/** Mocked IPC message classes (same references as SendPhase2). Use instanceof, not constructor.name. */
const ipcCardanoMessageTypes = () =>
  jest.requireMock("@keplr-wallet/background") as {
    GetCardanoSyncStatusMsg: new (chainId?: string) => object;
    BuildSendAdaTxDraftMsg: new (...args: unknown[]) => object;
    DiscardSendAdaTxDraftMsg: new (draftId?: string) => object;
    SubmitSendAdaTxDraftMsg: new (draftId: string, chainId?: string) => object;
    SubmitSendAdaTxDraftWithPasswordMsg: new (
      draftId: string,
      password: string,
      chainId?: string
    ) => object;
  };

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

const sendConfigs = {
  recipientConfig: {
    recipient: "addr_test1recipient",
    rawRecipient: "addr_test1recipient",
    error: undefined as Error | undefined,
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

/** Drain nested Promise continuations (e.g. async sync poll + follow-up state). */
const flushMicrotasksDeep = async (rounds = 8): Promise<void> => {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
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
    (jest.requireMock("../../hooks").useNetwork as jest.Mock).mockReturnValue({
      isOnline: true,
    });
    mockSendMessage.mockImplementation((_port: unknown, msg: unknown) => {
      const bg = ipcCardanoMessageTypes();
      if (msg instanceof bg.GetCardanoSyncStatusMsg) {
        return Promise.resolve({
          state: "ready_with_data",
          isSettled: true,
        });
      }
      if (msg instanceof bg.BuildSendAdaTxDraftMsg) {
        return Promise.resolve({
          kind: "draft",
          draftId: "draft-id-default",
          fee: "170000",
          total: "1230000",
        });
      }
      if (msg instanceof bg.DiscardSendAdaTxDraftMsg) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
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
    isDetachedPage?: boolean;
    /** When set, used instead of default cardano-testnet / cosmoshub-4 (e.g. poll effect deps). */
    chainId?: string;
  }) => {
    const isCardano = props?.isCardano ?? true;
    const isDetachedPage = props?.isDetachedPage ?? false;
    const chainId =
      props?.chainId ?? (isCardano ? "cardano-testnet" : "cosmoshub-4");
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
          isDetachedPage={isDetachedPage}
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
      await flushMicrotasksDeep();
    });
    await act(async () => {
      jest.advanceTimersByTime(350);
      await flushMicrotasksDeep();
    });
  };

  it("keeps modal open and shows inline error for modal-level failure", async () => {
    renderComponent();
    await advanceDraftBuild();

    const reviewButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Review Transaction")
    ) as HTMLButtonElement;
    await act(async () => {
      reviewButton.click();
      await flushMicrotasksDeep();
    });

    const modalEl = container.querySelector("[data-testid='password-modal']");
    expect(modalEl).not.toBeNull();
    const modalRoot = modalEl as HTMLElement;
    const input = modalRoot.querySelector(
      "[data-testid='password-input']"
    ) as HTMLInputElement;
    await act(async () => {
      Simulate.change(input, { target: { value: "bad-password" } } as any);
      await flushMicrotasksDeep();
    });

    mockSendMessage.mockRejectedValueOnce(
      new Error("cardano_ui_error:invalid_password:Invalid password")
    );

    const confirmButton = [...modalRoot.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Confirm")
    ) as HTMLButtonElement;
    await act(async () => {
      confirmButton.click();
      await flushMicrotasksDeep();
    });

    expect(
      container.querySelector("[data-testid='password-modal']")
    ).not.toBeNull();
    expect(
      container.querySelector("[data-testid='password-error']")?.textContent
    ).toContain("Invalid password");
    expect(
      mockNavigate.mock.calls.some(
        (call) =>
          call[0] === "/send" && call[1]?.state?.trnsxStatus === "failed"
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

    const reviewButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Review Transaction")
    ) as HTMLButtonElement;
    await act(async () => {
      reviewButton.click();
      await flushMicrotasksDeep();
    });

    const modalEl = container.querySelector("[data-testid='password-modal']");
    expect(modalEl).not.toBeNull();
    const modalRoot = modalEl as HTMLElement;
    const input = modalRoot.querySelector(
      "[data-testid='password-input']"
    ) as HTMLInputElement;
    await act(async () => {
      Simulate.change(input, { target: { value: "ok-password" } } as any);
      await flushMicrotasksDeep();
    });

    mockSendMessage.mockRejectedValueOnce(
      new Error("submit tx failed: provider unavailable")
    );

    const confirmButton = [...modalRoot.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Confirm")
    ) as HTMLButtonElement;
    await act(async () => {
      confirmButton.click();
      await flushMicrotasksDeep();
    });

    expect(
      mockNavigate.mock.calls.some(
        (call) =>
          call[0] === "/send" && call[1]?.state?.trnsxStatus === "failed"
      )
    ).toBe(true);
  });

  it("Cardano submit: navigates to pending only; no auto success after timer advance", async () => {
    renderComponent();
    await advanceDraftBuild();

    const reviewButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Review Transaction")
    ) as HTMLButtonElement;
    await act(async () => {
      reviewButton.click();
      await flushMicrotasksDeep();
    });

    const modalEl = container.querySelector("[data-testid='password-modal']");
    expect(modalEl).not.toBeNull();
    const modalRoot = modalEl as HTMLElement;
    const input = modalRoot.querySelector(
      "[data-testid='password-input']"
    ) as HTMLInputElement;
    await act(async () => {
      Simulate.change(input, { target: { value: "good-password" } } as any);
      await flushMicrotasksDeep();
    });

    mockSendMessage.mockResolvedValueOnce("tx-id-1");

    const confirmButton = [...modalRoot.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Confirm")
    ) as HTMLButtonElement;
    const navigateCountBeforeSubmit = mockNavigate.mock.calls.length;
    await act(async () => {
      confirmButton.click();
      await flushMicrotasksDeep();
    });

    const submitNavigateCalls = mockNavigate.mock.calls.slice(
      navigateCountBeforeSubmit
    );
    const submitPendingCalls = submitNavigateCalls.filter(
      (call) =>
        call[0] === "/send" && call[1]?.state?.trnsxStatus === "pending"
    );
    expect(submitPendingCalls.length).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(350);
      await flushMicrotasksDeep();
    });

    const successCalls = mockNavigate.mock.calls.filter(
      (call) => call[0] === "/send" && call[1]?.state?.trnsxStatus === "success"
    );
    expect(successCalls.length).toBe(0);

    const pendingRouteState = submitPendingCalls[0]?.[1]?.state as Record<
      string,
      unknown
    >;
    expect(pendingRouteState).toBeDefined();
    mockLocationState = pendingRouteState;
    renderComponent({
      trnsxStatus: (pendingRouteState as { trnsxStatus: string }).trnsxStatus,
    });
    expect(container.textContent).toContain("Transaction Pending");
  });

  it("Cardano detached submit: calls window.close and does not navigate to success after timer", async () => {
    const closeSpy = jest.spyOn(window, "close").mockImplementation(() => {});

    try {
      renderComponent({ isDetachedPage: true });
      await advanceDraftBuild();

      const reviewButton = [...container.querySelectorAll("button")].find(
        (button) => button.textContent?.includes("Review Transaction")
      ) as HTMLButtonElement;
      await act(async () => {
        reviewButton.click();
        await flushMicrotasksDeep();
      });

      const modalEl = container.querySelector("[data-testid='password-modal']");
      expect(modalEl).not.toBeNull();
      const modalRoot = modalEl as HTMLElement;
      const input = modalRoot.querySelector(
        "[data-testid='password-input']"
      ) as HTMLInputElement;
      await act(async () => {
        Simulate.change(input, { target: { value: "good-password" } } as any);
        await flushMicrotasksDeep();
      });

      const navigateCountBeforeSubmit = mockNavigate.mock.calls.length;
      mockSendMessage.mockResolvedValueOnce("tx-id-detached");

      const confirmButton = [...modalRoot.querySelectorAll("button")].find(
        (button) => button.textContent?.includes("Confirm")
      ) as HTMLButtonElement;
      await act(async () => {
        confirmButton.click();
        await flushMicrotasksDeep();
      });

      const submitNavigateCalls = mockNavigate.mock.calls.slice(
        navigateCountBeforeSubmit
      );
      expect(
        submitNavigateCalls.filter(
          (call) =>
            call[0] === "/send" && call[1]?.state?.trnsxStatus === "pending"
        ).length
      ).toBe(1);
      expect(closeSpy).toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(350);
        await flushMicrotasksDeep();
      });

      expect(
        mockNavigate.mock.calls.filter(
          (call) =>
            call[0] === "/send" && call[1]?.state?.trnsxStatus === "success"
        ).length
      ).toBe(0);
    } finally {
      closeSpy.mockRestore();
    }
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

    const reviewButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Review Transaction")
    ) as HTMLButtonElement;
    await act(async () => {
      reviewButton.click();
      await flushMicrotasks();
    });

    expect(
      container.querySelector("[data-testid='password-modal']")
    ).toBeNull();
    expect(nonCardanoSend).toHaveBeenCalled();
    expect(
      mockNavigate.mock.calls.some(
        (call) =>
          call[0] === "/send" && call[1]?.state?.trnsxStatus === "pending"
      )
    ).toBe(true);
    expect(
      mockNavigate.mock.calls.some(
        (call) =>
          call[0] === "/send" && call[1]?.state?.trnsxStatus === "success"
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

    const reviewButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Review Transaction")
    ) as HTMLButtonElement;
    await act(async () => {
      reviewButton.click();
      await flushMicrotasks();
    });

    expect(nonCardanoSend).toHaveBeenCalled();
    expect(
      mockNavigate.mock.calls.some(
        (call) =>
          call[0] === "/send" && call[1]?.state?.trnsxStatus === "success"
      )
    ).toBe(true);
    expect(
      mockNavigate.mock.calls.some(
        (call) =>
          call[0] === "/send" && call[1]?.state?.trnsxStatus === "pending"
      )
    ).toBe(true);
  });

  it("Cardano: no Transaction is not ready with prefilled amount and empty recipient", async () => {
    const hooks = jest.requireMock("@keplr-wallet/hooks") as unknown as {
      EmptyAddressError: new (message: string) => Error;
    };
    const prevRecipient = sendConfigs.recipientConfig.recipient;
    const prevRaw = sendConfigs.recipientConfig.rawRecipient;
    const prevRecipientError = sendConfigs.recipientConfig.error;

    sendConfigs.recipientConfig.recipient = "";
    sendConfigs.recipientConfig.rawRecipient = "";
    sendConfigs.recipientConfig.error = new hooks.EmptyAddressError(
      "Address is empty"
    );

    try {
      renderComponent();
      await act(async () => {
        jest.advanceTimersByTime(350);
        await flushMicrotasksDeep();
      });
      expect(container.textContent).not.toContain("Transaction is not ready");
    } finally {
      sendConfigs.recipientConfig.recipient = prevRecipient;
      sendConfigs.recipientConfig.rawRecipient = prevRaw;
      sendConfigs.recipientConfig.error = prevRecipientError;
    }
  });

  describe("Cardano sync polling recovery", () => {
    type SyncQueueItem = "reject" | { state: string; isSettled?: boolean };

    let syncQueue: SyncQueueItem[];

    const countGetCardanoSyncStatusCalls = (): number => {
      const { GetCardanoSyncStatusMsg } = ipcCardanoMessageTypes();
      return mockSendMessage.mock.calls.filter(
        (call) => call[1] instanceof GetCardanoSyncStatusMsg
      ).length;
    };

    const bottomActionButton = (): HTMLButtonElement | undefined =>
      [...container.querySelectorAll("button")].find(
        (b) =>
          b.textContent?.includes("Review Transaction") ||
          b.textContent?.includes("Syncing wallet")
      ) as HTMLButtonElement | undefined;

    beforeEach(() => {
      syncQueue = [];
      mockSendMessage.mockImplementation((_port: unknown, msg: unknown) => {
        const bg = ipcCardanoMessageTypes();
        if (msg instanceof bg.GetCardanoSyncStatusMsg) {
          const item = syncQueue.shift();
          if (item === "reject") {
            return Promise.reject(
              new Error("GetCardanoSyncStatusMsg ipc fail")
            );
          }
          if (item == null) {
            return Promise.reject(new Error("sync queue exhausted"));
          }
          return Promise.resolve(item);
        }
        if (msg instanceof bg.BuildSendAdaTxDraftMsg) {
          return Promise.resolve({
            kind: "draft",
            draftId: "draft-id",
            fee: "170000",
            total: "1230000",
          });
        }
        if (msg instanceof bg.DiscardSendAdaTxDraftMsg) {
          return Promise.resolve(undefined);
        }
        return Promise.resolve("tx-ok");
      });
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
      expect(container.textContent).not.toContain("Transaction is not ready");

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(2);

      btn = bottomActionButton();
      expect(btn?.textContent).toContain("Syncing wallet");
      expect(btn?.disabled).toBe(true);
      expect(container.textContent).not.toContain("Transaction is not ready");

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

    it("operational guard: no red Transaction is not ready while offline and sync pending", async () => {
      (jest.requireMock("../../hooks").useNetwork as jest.Mock).mockReturnValue(
        {
          isOnline: false,
        }
      );
      syncQueue = [{ state: "syncing", isSettled: false }];
      mockSendMessage.mockImplementation((_port: unknown, msg: unknown) => {
        const bg = ipcCardanoMessageTypes();
        if (msg instanceof bg.GetCardanoSyncStatusMsg) {
          return Promise.resolve(syncQueue[0]);
        }
        if (msg instanceof bg.BuildSendAdaTxDraftMsg) {
          return Promise.resolve({
            kind: "draft",
            draftId: "draft-id",
            fee: "170000",
            total: "1230000",
          });
        }
        if (msg instanceof bg.DiscardSendAdaTxDraftMsg) {
          return Promise.resolve(undefined);
        }
        return Promise.resolve("tx-ok");
      });
      renderComponent();
      await act(async () => {
        await flushMicrotasks();
      });
      expect(container.textContent).not.toContain("Transaction is not ready");
      expect(container.textContent).toContain("cardano.status.offline");
      const actionBtn = [...container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("cardano.status.offline")
      );
      expect(actionBtn?.disabled).toBe(true);
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

    it("sequential poll: long first GetCardanoSyncStatusMsg does not overlap; 2s delay after await", async () => {
      let firstResolve!: (value: { state: string; isSettled: boolean }) => void;
      const firstDeferred = new Promise<{ state: string; isSettled: boolean }>(
        (resolve) => {
          firstResolve = resolve;
        }
      );
      let syncCallIndex = 0;
      mockSendMessage.mockImplementation((_port: unknown, msg: unknown) => {
        const bg = ipcCardanoMessageTypes();
        if (msg instanceof bg.GetCardanoSyncStatusMsg) {
          syncCallIndex += 1;
          if (syncCallIndex === 1) {
            return firstDeferred;
          }
          return Promise.resolve({ state: "syncing", isSettled: false });
        }
        if (msg instanceof bg.BuildSendAdaTxDraftMsg) {
          return Promise.resolve({
            kind: "draft",
            draftId: "draft-id",
            fee: "170000",
            total: "1230000",
          });
        }
        if (msg instanceof bg.DiscardSendAdaTxDraftMsg) {
          return Promise.resolve(undefined);
        }
        return Promise.resolve("tx-ok");
      });

      renderComponent();
      await act(async () => {
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(1);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(1);

      await act(async () => {
        firstResolve({ state: "syncing", isSettled: false });
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(1);

      await act(async () => {
        jest.advanceTimersByTime(1999);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(1);

      await act(async () => {
        jest.advanceTimersByTime(1);
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(2);
    });

    it("stale sync response from previous chain does not revert ready UI on new chain", async () => {
      let chainAResolve!: (value: {
        state: string;
        isSettled: boolean;
      }) => void;
      const chainADeferred = new Promise<{ state: string; isSettled: boolean }>(
        (resolve) => {
          chainAResolve = resolve;
        }
      );

      mockSendMessage.mockImplementation((_port: unknown, msg: unknown) => {
        const bg = ipcCardanoMessageTypes();
        if (msg instanceof bg.GetCardanoSyncStatusMsg) {
          const chainId = (msg as { chainId?: string }).chainId;
          if (chainId === "cardano-chain-a") {
            return chainADeferred;
          }
          if (chainId === "cardano-chain-b") {
            return Promise.resolve({
              state: "ready_with_data",
              isSettled: true,
            });
          }
          return Promise.reject(
            new Error("unexpected GetCardanoSyncStatusMsg chainId")
          );
        }
        if (msg instanceof bg.BuildSendAdaTxDraftMsg) {
          return Promise.resolve({
            kind: "draft",
            draftId: "draft-id",
            fee: "170000",
            total: "1230000",
          });
        }
        if (msg instanceof bg.DiscardSendAdaTxDraftMsg) {
          return Promise.resolve(undefined);
        }
        return Promise.resolve("tx-ok");
      });

      renderComponent({ chainId: "cardano-chain-a" });
      await act(async () => {
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(1);

      await act(async () => {
        renderComponent({ chainId: "cardano-chain-b" });
        await flushMicrotasks();
      });
      expect(countGetCardanoSyncStatusCalls()).toBe(2);

      await runDraftDebounce();

      let btn = bottomActionButton();
      expect(btn?.textContent).toContain("Review Transaction");
      expect(btn?.disabled).toBe(false);
      expect(container.textContent).not.toMatch(/Syncing Cardano wallet/i);

      await act(async () => {
        chainAResolve({ state: "syncing", isSettled: false });
        await flushMicrotasks();
      });

      btn = bottomActionButton();
      expect(btn?.textContent).toContain("Review Transaction");
      expect(btn?.disabled).toBe(false);
      expect(container.textContent).not.toMatch(/Syncing Cardano wallet/i);
    });
  });

  it("shows user-facing minimum_violation message for sub-lovelace ADA", async () => {
    sendConfigs.amountConfig.amount = "0.0000001";
    sendConfigs.recipientConfig.recipient = "addr_test1recipient";
    sendConfigs.recipientConfig.rawRecipient = "addr_test1recipient";
    sendConfigs.recipientConfig.error = undefined;

    mockSendMessage.mockImplementation((_port: unknown, msg: unknown) => {
      const bg = ipcCardanoMessageTypes();
      if (msg instanceof bg.GetCardanoSyncStatusMsg) {
        return Promise.resolve({ state: "ready_with_data", isSettled: true });
      }
      if (msg instanceof bg.BuildSendAdaTxDraftMsg) {
        return Promise.resolve({
          kind: "minimum_violation",
          minimumOutputLovelace: "970000",
          coinMissingLovelace: "969999",
        });
      }
      if (msg instanceof bg.DiscardSendAdaTxDraftMsg) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve("ok");
    });

    renderComponent();
    await advanceDraftBuild();
    expect(container.textContent).toContain(
      "Amount too small. Minimum required is 0.97 tADA"
    );
  });

  it("shows same minimum_violation message for exactly 1 lovelace (0.000001 tADA)", async () => {
    sendConfigs.amountConfig.amount = "0.000001";
    sendConfigs.recipientConfig.recipient = "addr_test1recipient";
    sendConfigs.recipientConfig.rawRecipient = "addr_test1recipient";
    sendConfigs.recipientConfig.error = undefined;

    mockSendMessage.mockImplementation((_port: unknown, msg: unknown) => {
      const bg = ipcCardanoMessageTypes();
      if (msg instanceof bg.GetCardanoSyncStatusMsg) {
        return Promise.resolve({ state: "ready_with_data", isSettled: true });
      }
      if (msg instanceof bg.BuildSendAdaTxDraftMsg) {
        return Promise.resolve({
          kind: "minimum_violation",
          minimumOutputLovelace: "970000",
          coinMissingLovelace: "969999",
        });
      }
      if (msg instanceof bg.DiscardSendAdaTxDraftMsg) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve("ok");
    });

    renderComponent();
    await advanceDraftBuild();
    expect(container.textContent).toContain(
      "Amount too small. Minimum required is 0.97 tADA"
    );
    expect(container.textContent).not.toContain("amount must be a positive number");
  });

  it("handles lifecycle valid -> minimum_violation -> valid with draft cleanup", async () => {
    sendConfigs.recipientConfig.recipient = "addr_test1recipient";
    sendConfigs.recipientConfig.rawRecipient = "addr_test1recipient";
    sendConfigs.recipientConfig.error = undefined;
    const queue = [
      { kind: "draft", draftId: "d1", fee: "100", total: "1100" },
      {
        kind: "minimum_violation",
        minimumOutputLovelace: "970000",
        coinMissingLovelace: "1",
      },
      { kind: "draft", draftId: "d2", fee: "100", total: "1100" },
    ];
    mockSendMessage.mockImplementation((_port: unknown, msg: unknown) => {
      const bg = ipcCardanoMessageTypes();
      if (msg instanceof bg.GetCardanoSyncStatusMsg) {
        return Promise.resolve({ state: "ready_with_data", isSettled: true });
      }
      if (msg instanceof bg.BuildSendAdaTxDraftMsg) {
        return Promise.resolve(queue.shift());
      }
      if (msg instanceof bg.DiscardSendAdaTxDraftMsg) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve("ok");
    });

    sendConfigs.amountConfig.amount = "1";
    renderComponent();
    await advanceDraftBuild();

    sendConfigs.amountConfig.amount = "0.0000001";
    renderComponent();
    await advanceDraftBuild();
    expect(container.textContent).toContain(
      "Amount too small. Minimum required is 0.97 tADA"
    );

    sendConfigs.amountConfig.amount = "2";
    renderComponent();
    await advanceDraftBuild();
    expect(container.textContent).not.toContain(
      "Amount too small. Minimum required is 0.97 tADA"
    );

    const { DiscardSendAdaTxDraftMsg } = ipcCardanoMessageTypes();
    const discardCalls = mockSendMessage.mock.calls.filter(
      (c) => c[1] instanceof DiscardSendAdaTxDraftMsg
    );
    expect(discardCalls.length).toBeGreaterThan(0);
  });

  it("discards late draft response after cancellation and on early-return", async () => {
    sendConfigs.recipientConfig.recipient = "addr_test1recipient";
    sendConfigs.recipientConfig.rawRecipient = "addr_test1recipient";
    sendConfigs.recipientConfig.error = undefined;
    sendConfigs.amountConfig.amount = "1";

    let resolveLate!: (value: unknown) => void;
    const late = new Promise((resolve) => {
      resolveLate = resolve;
    });
    let buildCount = 0;
    mockSendMessage.mockImplementation((_port: unknown, msg: unknown) => {
      const bg = ipcCardanoMessageTypes();
      if (msg instanceof bg.GetCardanoSyncStatusMsg) {
        return Promise.resolve({ state: "ready_with_data", isSettled: true });
      }
      if (msg instanceof bg.BuildSendAdaTxDraftMsg) {
        buildCount += 1;
        if (buildCount === 1) return late;
        return Promise.resolve({
          kind: "draft",
          draftId: "fresh-draft",
          fee: "100",
          total: "1100",
        });
      }
      if (msg instanceof bg.DiscardSendAdaTxDraftMsg) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve("ok");
    });

    renderComponent();
    await advanceDraftBuild();

    sendConfigs.amountConfig.amount = "2";
    renderComponent();
    await advanceDraftBuild();

    await act(async () => {
      resolveLate({
        kind: "draft",
        draftId: "late-draft",
        fee: "100",
        total: "1100",
      });
      await flushMicrotasksDeep();
    });

    sendConfigs.recipientConfig.recipient = "";
    sendConfigs.recipientConfig.rawRecipient = "";
    renderComponent();
    await act(async () => {
      await flushMicrotasksDeep();
    });

    const { DiscardSendAdaTxDraftMsg: DiscardMsg } = ipcCardanoMessageTypes();
    const discarded = mockSendMessage.mock.calls
      .filter((c) => c[1] instanceof DiscardMsg)
      .map((c) => (c[1] as { draftId?: string }).draftId);
    expect(discarded).toContain("late-draft");
    expect(discarded).toContain("fresh-draft");
  });
});
