import { Message } from "@keplr-wallet/router";
import { ChainInfoWithCoreTypes } from "./types";
import { ChainInfo, ChainInfoWithoutEndpoints } from "@keplr-wallet/types";
import { ROUTE } from "./constants";
import { NetworkConfig } from "@fetchai/wallet-types";

export class GetChainInfosMsg extends Message<{
  chainInfos: ChainInfoWithCoreTypes[];
}> {
  public static type() {
    return "get-chain-infos";
  }

  validateBasic(): void {
    // noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetChainInfosMsg.type();
  }
}

export class GetChainInfosWithoutEndpointsMsg extends Message<{
  chainInfos: ChainInfoWithoutEndpoints[];
}> {
  public static type() {
    return "get-chain-infos-without-endpoints";
  }

  validateBasic(): void {
    // noop
  }

  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetChainInfosWithoutEndpointsMsg.type();
  }
}

export class SuggestChainInfoMsg extends Message<void> {
  public static type() {
    return "suggest-chain-info";
  }

  constructor(public readonly chainInfo: ChainInfo) {
    super();
  }

  validateBasic(): void {
    if (!this.chainInfo) {
      throw new Error("Chain info not set");
    }
  }

  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return SuggestChainInfoMsg.type();
  }
}

export class RemoveSuggestedChainInfoMsg extends Message<
  ChainInfoWithCoreTypes[]
> {
  public static type() {
    return "remove-suggested-chain-info";
  }

  constructor(public readonly chainId: string) {
    super();
  }

  validateBasic(): void {
    if (!this.chainId) {
      throw new Error("Chain id not set");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return RemoveSuggestedChainInfoMsg.type();
  }
}

export class GetNetworkMsg extends Message<NetworkConfig> {
  public static type() {
    return "current-network-msg";
  }

  constructor() {
    super();
  }

  validateBasic(): void {
    //  noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetNetworkMsg.type();
  }
}

export class ListNetworksMsg extends Message<NetworkConfig[]> {
  public static type() {
    return "list-network-msg";
  }

  constructor() {
    super();
  }

  validateBasic(): void {
    // noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return ListNetworksMsg.type();
  }
}

export class AddNetworkAndSwitchMsg extends Message<void> {
  public static type() {
    return "add-chain-by-network";
  }

  constructor(public readonly network: NetworkConfig) {
    super();
  }

  validateBasic(): void {
    if (!this.network) {
      throw new Error("chain info not set");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return AddNetworkAndSwitchMsg.type();
  }
}

export class SwitchNetworkByChainIdMsg extends Message<void> {
  public static type() {
    return "switch-network-by-chainid";
  }

  constructor(public readonly chainId: string) {
    super();
  }

  validateBasic(): void {
    if (!this.chainId) {
      throw new Error("network is empty");
    }
  }

  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return SwitchNetworkByChainIdMsg.type();
  }
}

export class GetSelectedChainIdMsg extends Message<{ chainId: string }> {
  public static type() {
    return "get-selected-chain-id";
  }

  constructor() {
    super();
  }

  validateBasic(): void {
    // noop
  }

  // Exposes selected chain id to callers; keep `approveExternal` aligned with product/security review (fingerprinting surface).
  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetSelectedChainIdMsg.type();
  }
}

/** Internal UI read of durable `{ chainId, revision }`. Not external-approved. */
export class GetSelectedChainSnapshotMsg extends Message<{
  chainId: string;
  revision: number;
}> {
  public static type() {
    return "get-selected-chain-snapshot";
  }

  constructor() {
    super();
  }

  validateBasic(): void {
    // noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetSelectedChainSnapshotMsg.type();
  }
}

/** Internal UI select with `{ chainId, revision }` ack. Not external-approved. */
export class SelectSelectedChainMsg extends Message<{
  chainId: string;
  revision: number;
}> {
  public static type() {
    return "select-selected-chain";
  }

  constructor(public readonly chainId: string) {
    super();
  }

  validateBasic(): void {
    if (!this.chainId) {
      throw new Error("Chain info not set");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return SelectSelectedChainMsg.type();
  }
}

/**
 * Internal UI pull of selection + registry under the authority FIFO barrier.
 * Not external-approved. Payload is authoritative for projection apply.
 */
export class GetNetworkProjectionMsg extends Message<{
  selection: { chainId: string; revision: number };
  chainInfos: ChainInfoWithCoreTypes[];
}> {
  public static type() {
    return "get-network-projection";
  }

  constructor() {
    super();
  }

  validateBasic(): void {
    // noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetNetworkProjectionMsg.type();
  }
}

/**
 * After Select ACK on live Cardano sign CTA: bind ticket to interactionId at
 * current authority revision. Internal only.
 */
export class IssueSignSwitchTicketMsg extends Message<{ ok: true }> {
  public static type() {
    return "issue-sign-switch-ticket";
  }

  constructor(
    public readonly interactionId: string,
    public readonly chainId: string
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.interactionId) {
      throw new Error("interactionId not set");
    }
    if (!this.chainId) {
      throw new Error("chainId not set");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return IssueSignSwitchTicketMsg.type();
  }
}

/** Query whether the sign switch ticket is still valid for this interaction. */
export class GetSignSwitchTicketValidMsg extends Message<{ valid: boolean }> {
  public static type() {
    return "get-sign-switch-ticket-valid";
  }

  constructor(
    public readonly interactionId: string,
    public readonly expectedChainId: string
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.interactionId) {
      throw new Error("interactionId not set");
    }
    if (!this.expectedChainId) {
      throw new Error("expectedChainId not set");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetSignSwitchTicketValidMsg.type();
  }
}

/** Drop ticket (supersede / undo after CTA ACK). */
export class ClearSignSwitchTicketMsg extends Message<{ ok: true }> {
  public static type() {
    return "clear-sign-switch-ticket";
  }

  constructor(public readonly interactionId?: string) {
    super();
  }

  validateBasic(): void {
    // noop — clear all or matching id
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return ClearSignSwitchTicketMsg.type();
  }
}
