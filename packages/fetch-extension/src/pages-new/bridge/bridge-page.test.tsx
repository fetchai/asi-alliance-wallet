import React from "react";
import { renderToString } from "react-dom/server";
import { BridgePage } from "./index";

jest.mock("mobx-react-lite", () => ({
  observer: (c: unknown) => c,
}));

const bridgeSupportedSpy = jest.fn(
  (_props: { mode: "ethereum" | "fetchhub" }) => (
    <div data-testid="bridge-supported-mock">supported</div>
  )
);

jest.mock("./bridge-supported-content", () => ({
  BridgeSupportedContent: (props: { mode: "ethereum" | "fetchhub" }) =>
    bridgeSupportedSpy(props),
}));

jest.mock("@layouts-v2/header-layout", () => ({
  HeaderLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="header-layout">{children}</div>
  ),
}));

jest.mock("react-router", () => ({
  useNavigate: () => jest.fn(),
}));

let mockChainId = "cardano-preview";

jest.mock("../../stores", () => ({
  useStore: () => ({
    chainStore: {
      get current() {
        return { chainId: mockChainId };
      },
    },
    queriesStore: {
      get: mockQueriesGet,
    },
  }),
}));

const mockQueriesGet = jest.fn();

/**
 * With BridgeSupportedContent mocked, real EthereumBridge / FetchhubBridge strings never reach HTML;
 * the meaningful assertion is `bridgeSupportedSpy` not being called. These substring checks are
 * extra smoke and document intent if the mock is removed (symmetry with fetchhub-bridge strings).
 */
function expectNoLegacyBridgeMarketingCopy(html: string) {
  expect(html).not.toContain("Fetching Bridge details");
  expect(html).not.toContain("Native to ERC20");
  expect(html).not.toContain("Recipient (Fetchhub address)");
  expect(html).not.toContain("Recipient (Ethereum address)");
  expect(html).not.toContain("Bridge to your Fetchhub address");
  expect(html).not.toContain("Bridge to your Ethereum address");
}

describe("BridgePage", () => {
  beforeEach(() => {
    bridgeSupportedSpy.mockClear();
    mockQueriesGet.mockClear();
    mockChainId = "cardano-preview";
  });

  it("unsupported chain: spy not called (primary); optional string smoke for legacy bridge copy", () => {
    const html = renderToString(<BridgePage />);

    expect(bridgeSupportedSpy).not.toHaveBeenCalled();
    expect(mockQueriesGet).not.toHaveBeenCalled();
    expect(html).toContain("Bridge is not available on this network");
    expect(html).toContain("Go back and switch to Ethereum or Fetchhub");
    expectNoLegacyBridgeMarketingCopy(html);
  });

  it("BSC (evm but not whitelisted): unsupported state", () => {
    mockChainId = "56";
    const html = renderToString(<BridgePage />);

    expect(bridgeSupportedSpy).not.toHaveBeenCalled();
    expect(mockQueriesGet).not.toHaveBeenCalled();
    expect(html).toContain("Bridge is not available on this network");
    expectNoLegacyBridgeMarketingCopy(html);
  });

  it("Ethereum: mounts BridgeSupportedContent with ethereum mode", () => {
    mockChainId = "1";
    renderToString(<BridgePage />);

    expect(bridgeSupportedSpy).toHaveBeenCalledWith({ mode: "ethereum" });
  });

  it("Fetchhub: mounts BridgeSupportedContent with fetchhub mode", () => {
    mockChainId = "fetchhub-4";
    renderToString(<BridgePage />);

    expect(bridgeSupportedSpy).toHaveBeenCalledWith({ mode: "fetchhub" });
  });
});
