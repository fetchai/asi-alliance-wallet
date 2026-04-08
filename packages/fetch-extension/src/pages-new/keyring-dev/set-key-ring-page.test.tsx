/**
 * @jest-environment jsdom
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { SetKeyRingPage } from "./index";

const wA =
  "fetch1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const wB =
  "fetch1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const shortA = wA.slice(0, 8).toLowerCase();
const shortB = wB.slice(0, 8).toLowerCase();

const mockNavigate = jest.fn();
const mockNotificationPush = jest.fn();
const mockSetLoading = jest.fn();

/** Mutable hook return; simulates stale addressesById during wallet switch. */
const syncMock = {
  addressesById: {} as Record<string, string>,
  isLoadingAddresses: false,
};

const baseKeyStore = {
  type: "mnemonic" as const,
  bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
};

function multiKeyStoreRows(aSelected: boolean) {
  return [
    {
      ...baseKeyStore,
      meta: { __id__: "idA", name: "WalletA" },
      selected: aSelected,
    },
    {
      ...baseKeyStore,
      meta: { __id__: "idB", name: "WalletB" },
      selected: !aSelected,
    },
  ];
}

const keyRingState = {
  multiKeyStoreInfo: multiKeyStoreRows(true),
};

jest.mock("mobx-react-lite", () => ({
  observer: (c: unknown) => c,
}));

jest.mock("./use-wallet-picker-address-sync", () => ({
  useWalletPickerAddressSync: () => ({
    addressesById: { ...syncMock.addressesById },
    isLoadingAddresses: syncMock.isLoadingAddresses,
  }),
}));

jest.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock("@components/notification", () => ({
  useNotification: () => ({ push: mockNotificationPush }),
}));

jest.mock("@components/loading-indicator", () => ({
  useLoadingIndicator: () => ({
    setIsLoading: mockSetLoading,
  }),
}));

jest.mock("@graphQL/messages-api", () => ({
  messageAndGroupListenerUnsubscribe: jest.fn(),
}));

jest.mock("react-intl", () => ({
  useIntl: () => ({
    formatMessage: (x: { id: string }) => x.id,
  }),
}));

jest.mock("../../utils", () => ({
  ensureChainCompatibleBeforeSelectKeyStore: jest.fn().mockResolvedValue(
    undefined
  ),
  requestKeyringSurfacesSyncBroadcast: jest.fn().mockResolvedValue(undefined),
  isCardanoChain: jest.fn(() => false),
  walletSupportsCardano: jest.fn(() => true),
}));

const mockChangeKeyRing = jest.fn().mockResolvedValue(undefined);

jest.mock("../../stores", () => ({
  useStore: () => ({
    chainStore: {
      current: {
        chainId: "fetchhub-4",
        features: [],
      },
      getChain: () => ({ features: [] }),
    },
    keyRingStore: {
      get multiKeyStoreInfo() {
        return keyRingState.multiKeyStoreInfo;
      },
      changeKeyRing: mockChangeKeyRing,
    },
    analyticsStore: { logEvent: jest.fn() },
    chatStore: {
      userDetailsStore: { resetUser: jest.fn() },
      messagesStore: {
        resetChatList: jest.fn(),
        setIsChatSubscriptionActive: jest.fn(),
      },
    },
    proposalStore: { resetProposals: jest.fn() },
  }),
}));

function countSubstring(haystack: string, needle: string): number {
  if (!needle) return 0;
  const m = haystack.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
  return m ? m.length : 0;
}

describe("SetKeyRingPage", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockChangeKeyRing.mockClear();
    syncMock.isLoadingAddresses = false;
    syncMock.addressesById = { idA: wA, idB: wB };
    keyRingState.multiKeyStoreInfo = multiKeyStoreRows(true);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders wallet-bound truncated addresses for all rows (selected uses same source as others)", async () => {
    await act(async () => {
      root.render(<SetKeyRingPage />);
    });

    const text = container.textContent ?? "";
    expect(text).toContain(shortA);
    expect(text).toContain(shortB);
  });

  /**
   * Regression: during A→B (and back), stale addressesById must not show wallet A's prefix twice —
   * that would mean the selected row briefly showed the other wallet's address.
   */
  it("does not duplicate wrong-wallet prefix when selection moves before addressesById catches up (A→B→A)", async () => {
    await act(async () => {
      root.render(<SetKeyRingPage />);
    });
    let text = container.textContent ?? "";
    expect(countSubstring(text, shortA)).toBe(1);
    expect(countSubstring(text, shortB)).toBe(1);

    keyRingState.multiKeyStoreInfo = multiKeyStoreRows(false);
    syncMock.addressesById = { idA: wA };
    await act(async () => {
      root.render(<SetKeyRingPage />);
    });
    text = container.textContent ?? "";
    expect(countSubstring(text, shortA)).toBe(1);

    syncMock.addressesById = { idA: wA, idB: wB };
    await act(async () => {
      root.render(<SetKeyRingPage />);
    });
    text = container.textContent ?? "";
    expect(countSubstring(text, shortA)).toBe(1);
    expect(countSubstring(text, shortB)).toBe(1);

    keyRingState.multiKeyStoreInfo = multiKeyStoreRows(true);
    syncMock.addressesById = { idB: wB };
    await act(async () => {
      root.render(<SetKeyRingPage />);
    });
    text = container.textContent ?? "";
    expect(countSubstring(text, shortB)).toBe(1);

    syncMock.addressesById = { idA: wA, idB: wB };
    await act(async () => {
      root.render(<SetKeyRingPage />);
    });
    text = container.textContent ?? "";
    expect(countSubstring(text, shortA)).toBe(1);
    expect(countSubstring(text, shortB)).toBe(1);
  });
});
