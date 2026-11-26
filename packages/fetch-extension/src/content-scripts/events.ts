import { Message, Router } from "@keplr-wallet/router";

class PushEventDataMsg<D = unknown> extends Message<void> {
  public static type() {
    return "push-event-data";
  }

  constructor(
    public readonly data: {
      type: string;
      data: D;
    }
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.data.type) {
      throw new Error("Type should not be empty");
    }
  }

  route(): string {
    return "interaction-foreground";
  }

  type(): string {
    return PushEventDataMsg.type();
  }
}

export function initEvents(router: Router) {
  router.registerMessage(PushEventDataMsg);

  router.addHandler("interaction-foreground", (_, msg) => {
    switch (msg.constructor) {
      case PushEventDataMsg:
        if ((msg as PushEventDataMsg).data.type === "keystore-changed") {
          window.dispatchEvent(new Event("fetchwallet_keystorechange"));
        }

        if ((msg as PushEventDataMsg).data.type === "status-changed") {
          window.dispatchEvent(new Event("fetchwallet_walletstatuschange"));
        }

        if ((msg as PushEventDataMsg).data.type === "network-changed") {
          window.dispatchEvent(new Event("fetchwallet_networkchange"));
        }
        if (
          (msg as PushEventDataMsg).data.type === "keplr_bitcoinChainChanged"
        ) {
          return window.dispatchEvent(
            new CustomEvent("keplr_bitcoinChainChanged", {
              detail: {
                ...(
                  msg as PushEventDataMsg<{
                    origin: string;
                    bitcoinChainId: string;
                    network: string;
                  }>
                ).data.data,
              },
            })
          );
        }

        return;
      default:
        throw new Error("Unknown msg type");
    }
  });
}
