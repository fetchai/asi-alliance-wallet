import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";

const mockNavigate = jest.fn();
const sendMessageMock = jest.fn();

jest.mock("@keplr-wallet/background", () => ({
  GetCardanoTrackedTxStatusMsg: class MockTrackedTxMsg {
    constructor(
      public readonly txId: string,
      public readonly chainId: string
    ) {}
  },
}));

jest.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock("@keplr-wallet/router-extension", () => ({
  InExtensionMessageRequester: jest.fn().mockImplementation(() => ({
    sendMessage: sendMessageMock,
  })),
}));

jest.mock("../../stores", () => ({
  useStore: () => ({
    chainStore: { current: { chainId: "cardano-preview" } },
  }),
}));

jest.mock("@components-v2/dropdown", () => ({
  Dropdown: ({
    children,
    closeClicked,
  }: {
    children: React.ReactNode;
    closeClicked?: () => void;
  }) => (
    <div data-testid="dropdown">
      <button
        type="button"
        data-testid="close-drawer"
        onClick={() => closeClicked?.()}
      />
      {children}
    </div>
  ),
}));

jest.mock("./transx-pending", () => ({
  TransxPending: () => <div>pending-ui</div>,
}));
jest.mock("./transx-success", () => ({
  TransxSuccess: () => <div>success-ui</div>,
}));
jest.mock("./transx-failed", () => ({
  TransxFailed: () => <div>failed-ui</div>,
}));

import { TransxStatus } from "./index";

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("TransxStatus Cardano tracking poll", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockNavigate.mockClear();
    sendMessageMock.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    jest.useRealTimers();
  });

  const renderTracking = (tracking: {
    txId: string;
    chainId: string;
    active: boolean;
  }) => {
    act(() => {
      root.render(
        <TransxStatus
          status="pending"
          cardanoSendTxTracking={tracking}
          onClose={jest.fn()}
        />
      );
    });
  };

  it("does not start a second poll until the first request completes", async () => {
    let resolveFirst!: (v: unknown) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    sendMessageMock.mockImplementationOnce(() => firstPromise);
    sendMessageMock.mockResolvedValue({
      state: "ready_with_data",
      txStatus: "pending",
    });

    renderTracking({
      txId: "aa",
      chainId: "cardano-preview",
      active: true,
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ state: "ready_with_data", txStatus: "pending" });
      await flushMicrotasks();
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(2500);
      await flushMicrotasks();
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(2);
  });

  it("ignores stale confirmed response after tracking txId changes (no success navigate)", async () => {
    let resolveSlow!: (v: unknown) => void;
    const slow = new Promise((resolve) => {
      resolveSlow = resolve;
    });
    sendMessageMock.mockImplementationOnce(() => slow);
    sendMessageMock.mockResolvedValue({
      state: "ready_with_data",
      txStatus: "pending",
    });

    renderTracking({
      txId: "tx-old",
      chainId: "cardano-preview",
      active: true,
    });

    await act(async () => {
      root.render(
        <TransxStatus
          status="pending"
          cardanoSendTxTracking={{
            txId: "tx-new",
            chainId: "cardano-preview",
            active: true,
          }}
          onClose={jest.fn()}
        />
      );
      await flushMicrotasks();
    });

    await act(async () => {
      resolveSlow({ state: "ready_with_data", txStatus: "confirmed" });
      await flushMicrotasks();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("ignores stale confirmed response after tracking chainId changes (no success navigate)", async () => {
    let resolveSlow!: (v: unknown) => void;
    const slow = new Promise((resolve) => {
      resolveSlow = resolve;
    });
    sendMessageMock.mockImplementationOnce(() => slow);
    sendMessageMock.mockResolvedValue({
      state: "ready_with_data",
      txStatus: "pending",
    });

    renderTracking({
      txId: "tx-same",
      chainId: "cardano-preview",
      active: true,
    });

    await act(async () => {
      root.render(
        <TransxStatus
          status="pending"
          cardanoSendTxTracking={{
            txId: "tx-same",
            chainId: "cardano-mainnet",
            active: true,
          }}
          onClose={jest.fn()}
        />
      );
      await flushMicrotasks();
    });

    await act(async () => {
      resolveSlow({ state: "ready_with_data", txStatus: "confirmed" });
      await flushMicrotasks();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates to success at most once when confirmed is returned repeatedly", async () => {
    sendMessageMock.mockResolvedValue({
      state: "ready_with_data",
      txStatus: "confirmed",
    });

    renderTracking({
      txId: "tx1",
      chainId: "cardano-preview",
      active: true,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(mockNavigate.mock.calls.length).toBe(1);
    expect(mockNavigate.mock.calls[0][0]).toBe("/send");
    expect(mockNavigate.mock.calls[0][1]).toEqual({
      replace: true,
      state: { trnsxStatus: "success", isNext: true },
    });

    await act(async () => {
      jest.advanceTimersByTime(10_000);
      await flushMicrotasks();
    });

    expect(mockNavigate.mock.calls.length).toBe(1);
  });

  it("does not schedule further polls or navigate after the drawer is closed", async () => {
    sendMessageMock.mockResolvedValue({
      state: "ready_with_data",
      txStatus: "pending",
    });

    renderTracking({
      txId: "tx-close",
      chainId: "cardano-preview",
      active: true,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="close-drawer"]')
        ?.click();
      await flushMicrotasks();
    });

    await act(async () => {
      jest.advanceTimersByTime(25_000);
      await flushMicrotasks();
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not navigate to success when confirmed arrives after close", async () => {
    let resolveSlow!: (v: unknown) => void;
    const slow = new Promise((resolve) => {
      resolveSlow = resolve;
    });
    sendMessageMock.mockImplementationOnce(() => slow);
    sendMessageMock.mockResolvedValue({
      state: "ready_with_data",
      txStatus: "pending",
    });

    renderTracking({
      txId: "tx-late",
      chainId: "cardano-preview",
      active: true,
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="close-drawer"]')
        ?.click();
      await flushMicrotasks();
    });

    await act(async () => {
      resolveSlow({ state: "ready_with_data", txStatus: "confirmed" });
      await flushMicrotasks();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
