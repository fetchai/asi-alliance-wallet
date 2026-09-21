import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import { RecoverMnemonicPage } from "./recover-mnemonic";

const PRIVATE_KEY_BYTES = Array.from({ length: 32 }, (_, index) => index);
const PRIVATE_KEY = PRIVATE_KEY_BYTES.map((byte) =>
  byte.toString(16).padStart(2, "0")
).join("");
const PREFIXED_PRIVATE_KEY = `0x${PRIVATE_KEY}`;
const MNEMONIC_12 = `${"abandon ".repeat(11)}about`;
const MNEMONIC_24 = `${"abandon ".repeat(23)}art`;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bip39 = require("bip39");
const MNEMONIC_15 = bip39.entropyToMnemonic("00".repeat(20));

const mockCreatePrivateKey = jest.fn().mockResolvedValue(undefined);
const mockCreateMnemonic = jest.fn().mockResolvedValue(undefined);
const mockChangeKeyRing = jest.fn().mockResolvedValue(undefined);
const mockSendMessage = jest.fn().mockResolvedValue(undefined);

const mockRegisterConfig = {
  mode: "add",
  isLoading: false,
  clear: jest.fn(),
  setType: jest.fn(),
  createPrivateKey: mockCreatePrivateKey,
  createMnemonic: mockCreateMnemonic,
};

jest.mock("mobx-react-lite", () => ({
  observer: (component: unknown) => component,
}));

jest.mock("../../../stores", () => ({
  useStore: () => ({
    analyticsStore: {
      logEvent: jest.fn(),
      setUserProperties: jest.fn(),
    },
    uiConfigStore: { platform: "chrome" },
    keyRingStore: {
      multiKeyStoreInfo: [],
      changeKeyRing: mockChangeKeyRing,
    },
    chainStore: { chainInfos: [] },
    accountStore: {},
  }),
}));

jest.mock("@utils/index", () => ({
  ensureCompatibleChainForUpcomingWallet: jest
    .fn()
    .mockResolvedValue(undefined),
  getNextDefaultAccountName: () => "Account 1",
  requestKeyringSurfacesSyncBroadcast: jest.fn().mockResolvedValue(undefined),
  supportsCardanoFromMnemonicWordCount: (count: number) => count === 24,
  validateAccountName: () => undefined,
}));

jest.mock("react-intl", () => ({
  FormattedMessage: ({ id }: { id: string }) => (
    <React.Fragment>{id}</React.Fragment>
  ),
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
  }),
}));

jest.mock("../index", () => ({
  BackButton: () => null,
}));

jest.mock("../advanced-bip44", () => ({
  AdvancedBIP44Option: () => null,
  useBIP44Option: () => ({ bip44HDPath: {} }),
}));

jest.mock("../ledger", () => ({ ImportLedgerPage: () => null }));
jest.mock("../migration", () => ({ MigrateEthereumAddressPage: () => null }));
jest.mock("../select-network", () => ({ SelectNetwork: () => null }));
jest.mock("@components-v2/password-strength/password-strength-meter", () => ({
  PasswordStrengthMeter: () => null,
}));
jest.mock("@components-v2/checkbox/checkbox", () => ({ Checkbox: () => null }));

jest.mock("@components-v2/card", () => ({
  Card: (props: {
    heading: string;
    onClick: (event: React.MouseEvent) => void;
  }) => (
    <button type="button" onClick={props.onClick}>
      {props.heading}
    </button>
  ),
}));

jest.mock("@components-v2/tabs/tabsPanel-2", () => ({
  TabsPanel: (props: {
    tabs: { id: string }[];
    activeTabId: string;
    setActiveTab: (id: string) => void;
    onTabClick: (id: string) => void;
  }) => (
    <div>
      {props.tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-pressed={props.activeTabId === tab.id}
          onClick={() => {
            props.onTabClick(tab.id);
            props.setActiveTab(tab.id);
          }}
        >
          {tab.id}
        </button>
      ))}
    </div>
  ),
}));

jest.mock("@components-v2/form", () => ({
  Input: React.forwardRef(function InputMock(
    props: React.InputHTMLAttributes<HTMLInputElement> & {
      error?: string;
      formGroupClassName?: string;
    },
    ref: React.Ref<HTMLInputElement>
  ) {
    const {
      error: _error,
      formGroupClassName: _formGroupClassName,
      ...rest
    } = props;
    return <input ref={ref} {...rest} />;
  }),
  PasswordInput: () => null,
}));

jest.mock("@components-v2/buttons/button", () => ({
  ButtonV2: (props: {
    type?: "button" | "submit" | "reset";
    text?: React.ReactNode;
    disabled?: boolean;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  }) => (
    <button type={props.type} disabled={props.disabled} onClick={props.onClick}>
      {props.text}
    </button>
  ),
}));

jest.mock("reactstrap", () => ({
  Form: (props: React.FormHTMLAttributes<HTMLFormElement>) => (
    <form {...props} />
  ),
  Label: (
    props: React.LabelHTMLAttributes<HTMLLabelElement> & { for?: string }
  ) => {
    const { for: htmlFor, ...rest } = props;
    return <label htmlFor={htmlFor} {...rest} />;
  },
}));

jest.mock("@keplr-wallet/router-extension", () => ({
  InExtensionMessageRequester: class {
    sendMessage(...args: unknown[]) {
      return mockSendMessage(...args);
    }
  },
}));

jest.mock("@keplr-wallet/background", () => ({
  RefreshAccountList: class {},
}));

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === text
  );
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

async function clickButton(
  container: HTMLElement,
  text: string
): Promise<void> {
  await act(async () => {
    findButton(container, text).dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
  });
}

function seedInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll("input.mnemonicWord"));
}

async function changeInput(
  input: HTMLInputElement,
  value: string
): Promise<void> {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pasteInput(
  input: HTMLInputElement,
  value: string
): Promise<void> {
  await act(async () => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => value },
    });
    input.dispatchEvent(event);
  });
}

async function submitForm(container: HTMLElement): Promise<void> {
  await act(async () => {
    container
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

describe("RecoverMnemonicPage mode regression", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockCreatePrivateKey.mockClear();
    mockCreateMnemonic.mockClear();
    mockChangeKeyRing.mockClear();
    mockSendMessage.mockClear();

    await act(async () => {
      root.render(
        <RecoverMnemonicPage registerConfig={mockRegisterConfig as never} />
      );
    });
    await clickButton(container, "Use a seed phrase or a private key");
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("allows manual entry of 64 hex or 0x plus 64 hex characters", async () => {
    await clickButton(container, "Private key");
    expect(seedInputs(container)).toHaveLength(1);
    expect(seedInputs(container)[0].maxLength).toBe(66);

    await changeInput(seedInputs(container)[0], PRIVATE_KEY);
    expect(seedInputs(container)[0].value).toBe(PRIVATE_KEY);

    await changeInput(seedInputs(container)[0], PREFIXED_PRIVATE_KEY);
    expect(seedInputs(container)[0].value).toBe(PREFIXED_PRIVATE_KEY);
  });

  it("keeps unrecognized pastes in the selected mode and reports its errors", async () => {
    await clickButton(container, "Private key");
    await pasteInput(seedInputs(container)[0], "not a private key");
    expect(seedInputs(container)[0].value).toBe("not a private key");
    await submitForm(container);
    expect(container.textContent).toContain(
      "register.import.textarea.private-key.error.invalid"
    );
    expect(container.textContent).not.toContain(
      "register.create.textarea.mnemonic.error.too-short"
    );

    await pasteInput(seedInputs(container)[0], "arbitrary text with spaces");
    expect(seedInputs(container)).toHaveLength(1);
    expect(seedInputs(container)[0].value).toBe("arbitrary text with spaces");
  });

  it("switches tabs to match pasted recovery values", async () => {
    expect(findButton(container, "12 words").getAttribute("aria-pressed")).toBe(
      "true"
    );

    await pasteInput(seedInputs(container)[0], PREFIXED_PRIVATE_KEY);
    expect(
      findButton(container, "Private key").getAttribute("aria-pressed")
    ).toBe("true");
    expect(seedInputs(container)).toHaveLength(1);
    expect(seedInputs(container)[0].value).toBe(PREFIXED_PRIVATE_KEY);

    await pasteInput(seedInputs(container)[0], MNEMONIC_24);
    expect(findButton(container, "24 words").getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(seedInputs(container)).toHaveLength(24);
    expect(
      seedInputs(container)
        .map((input) => input.value)
        .join(" ")
    ).toBe(MNEMONIC_24);

    await pasteInput(seedInputs(container)[7], MNEMONIC_12);
    expect(findButton(container, "12 words").getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(seedInputs(container)).toHaveLength(12);
    expect(
      seedInputs(container)
        .map((input) => input.value)
        .join(" ")
    ).toBe(MNEMONIC_12);
  });

  it("preserves and submits a standard 15-word BIP39 phrase", async () => {
    await pasteInput(seedInputs(container)[0], MNEMONIC_15);

    expect(findButton(container, "24 words").getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(seedInputs(container)).toHaveLength(24);
    expect(
      seedInputs(container)
        .slice(0, 15)
        .map((input) => input.value)
        .join(" ")
    ).toBe(MNEMONIC_15);
    expect(
      seedInputs(container)
        .slice(15)
        .every((input) => input.value === "")
    ).toBe(true);

    await submitForm(container);
    expect(mockCreateMnemonic).toHaveBeenCalledTimes(1);
    expect(mockCreateMnemonic.mock.calls[0][1]).toBe(MNEMONIC_15);
  });

  it("does not silently truncate pasted words beyond the selected mode", async () => {
    await pasteInput(seedInputs(container)[0], `${MNEMONIC_12} extra`);

    expect(findButton(container, "24 words").getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(seedInputs(container)).toHaveLength(24);
    await submitForm(container);
    expect(container.textContent).toContain(
      "register.import.textarea.mnemonic.error.invalid"
    );
    expect(mockCreateMnemonic).not.toHaveBeenCalled();

    await pasteInput(seedInputs(container)[0], `${MNEMONIC_24} extra`);
    expect(seedInputs(container)).toHaveLength(24);
    expect(seedInputs(container)[23].value).toBe("art extra");
    await submitForm(container);
    expect(container.textContent).toContain(
      "register.import.textarea.mnemonic.error.invalid"
    );
    expect(mockCreateMnemonic).not.toHaveBeenCalled();
  });

  it("routes a malformed 0x-prefixed value to private-key validation", async () => {
    await pasteInput(seedInputs(container)[0], "0x1234");

    expect(
      findButton(container, "Private key").getAttribute("aria-pressed")
    ).toBe("true");
    expect(seedInputs(container)).toHaveLength(1);
    await submitForm(container);
    expect(container.textContent).toContain(
      "register.import.textarea.private-key.error.invalid"
    );
    expect(container.textContent).not.toContain(
      "register.create.textarea.mnemonic.error.too-short"
    );
  });

  it("clears incompatible values and errors while switching fixed-size modes", async () => {
    await clickButton(container, "Private key");
    await pasteInput(seedInputs(container)[0], "bad key");
    await submitForm(container);
    expect(container.textContent).toContain(
      "register.import.textarea.private-key.error.invalid"
    );

    await clickButton(container, "12 words");
    expect(seedInputs(container)).toHaveLength(12);
    expect(seedInputs(container).every((input) => input.value === "")).toBe(
      true
    );
    expect(container.textContent).not.toContain(
      "register.import.textarea.private-key.error.invalid"
    );
    await pasteInput(seedInputs(container)[0], MNEMONIC_12);
    expect(
      seedInputs(container)
        .map((input) => input.value)
        .join(" ")
    ).toBe(MNEMONIC_12);

    await clickButton(container, "24 words");
    expect(seedInputs(container)).toHaveLength(24);
    expect(seedInputs(container).every((input) => input.value === "")).toBe(
      true
    );
    await pasteInput(seedInputs(container)[0], MNEMONIC_24);
    expect(
      seedInputs(container)
        .map((input) => input.value)
        .join(" ")
    ).toBe(MNEMONIC_24);

    await clickButton(container, "Private key");
    expect(seedInputs(container)).toHaveLength(1);
    expect(seedInputs(container)[0].value).toBe("");
  });

  it("routes submit according to the selected tab", async () => {
    await pasteInput(seedInputs(container)[0], PREFIXED_PRIVATE_KEY);
    await submitForm(container);

    expect(mockCreatePrivateKey).toHaveBeenCalledTimes(1);
    expect(Array.from(mockCreatePrivateKey.mock.calls[0][1])).toEqual(
      PRIVATE_KEY_BYTES
    );
    expect(mockCreateMnemonic).not.toHaveBeenCalled();

    await pasteInput(seedInputs(container)[0], MNEMONIC_12);
    await submitForm(container);

    expect(mockCreateMnemonic).toHaveBeenCalledTimes(1);
    expect(mockCreateMnemonic.mock.calls[0][1]).toBe(MNEMONIC_12);
  });
});
