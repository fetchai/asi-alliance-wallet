import { Router } from "@keplr-wallet/router";
import { SendAdaMsg, GetCardanoBalanceMsg, IsCardanoReadyMsg, EstimateSendAdaMsg, GetCardanoSyncStatusMsg } from "./messages";
import { ROUTE } from "./constants";
import { getHandler } from "./handler";
import { CardanoService } from "./service";
import { KeyRingService } from "../keyring/service";

export function init(router: Router, service: CardanoService, keyRingService: KeyRingService): void {
  router.registerMessage(SendAdaMsg);
  router.registerMessage(GetCardanoBalanceMsg);
  router.registerMessage(IsCardanoReadyMsg);
  router.registerMessage(EstimateSendAdaMsg);
  router.registerMessage(GetCardanoSyncStatusMsg);

  router.addHandler(ROUTE, getHandler(service, keyRingService));
}
