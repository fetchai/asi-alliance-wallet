import Transport from "@ledgerhq/hw-transport";

export type TransportIniter = (...args: any[]) => Promise<Transport>;

export interface LedgerOptions {
  defaultMode: string;
  platform: string;
  transportIniters: {
    [mode: string]: TransportIniter;
  };
}
