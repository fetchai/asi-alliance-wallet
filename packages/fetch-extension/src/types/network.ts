/**
 * Network connection state (Lace-style). Reserved for future use (e.g. store/status when adding
 * background connection events). Current UI uses useNetwork().isOnline only.
 */
export enum NetworkConnectionStates {
  CONNECTED = "connected",
  OFFLINE = "offline",
}
