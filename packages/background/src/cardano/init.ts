import { Router } from "@keplr-wallet/router";
import {
  GetCardanoBalanceMsg,
  IsCardanoReadyMsg,
  EstimateSendAdaMsg,
  BuildSendAdaTxDraftMsg,
  SubmitSendAdaTxDraftMsg,
  SubmitSendAdaTxDraftWithPasswordMsg,
  DiscardSendAdaTxDraftMsg,
  GetCardanoSyncStatusMsg,
  GetCardanoTxHistoryMsg,
  GetCardanoTrackedTxStatusMsg,
  GetCardanoTelemetryRequestCountsByTypeMsg,
  GetCardanoTelemetrySnapshotMsg,
  CaptureCardanoTelemetryBaselineMsg,
  GetCardanoTelemetryBaselinesMsg,
  LoadMoreCardanoTxHistoryMsg,
  GetMaxSpendableAdaMsg,
  GetBlockfrostCredentialsMsg,
  SetBlockfrostCredentialsMsg,
  ClearBlockfrostCredentialsMsg,
} from "./messages";
import { ROUTE } from "./constants";
import { getHandler } from "./handler";
import { CardanoService } from "./service";
import { KeyRingService } from "../keyring/service";

export function init(
  router: Router,
  service: CardanoService,
  keyRingService: KeyRingService
): void {
  router.registerMessage(GetCardanoBalanceMsg);
  router.registerMessage(IsCardanoReadyMsg);
  router.registerMessage(EstimateSendAdaMsg);
  router.registerMessage(BuildSendAdaTxDraftMsg);
  router.registerMessage(SubmitSendAdaTxDraftMsg);
  router.registerMessage(SubmitSendAdaTxDraftWithPasswordMsg);
  router.registerMessage(DiscardSendAdaTxDraftMsg);
  router.registerMessage(GetCardanoSyncStatusMsg);
  router.registerMessage(GetCardanoTxHistoryMsg);
  router.registerMessage(GetCardanoTrackedTxStatusMsg);
  router.registerMessage(GetCardanoTelemetryRequestCountsByTypeMsg);
  router.registerMessage(GetCardanoTelemetrySnapshotMsg);
  router.registerMessage(CaptureCardanoTelemetryBaselineMsg);
  router.registerMessage(GetCardanoTelemetryBaselinesMsg);
  router.registerMessage(LoadMoreCardanoTxHistoryMsg);
  router.registerMessage(GetMaxSpendableAdaMsg);
  router.registerMessage(GetBlockfrostCredentialsMsg);
  router.registerMessage(SetBlockfrostCredentialsMsg);
  router.registerMessage(ClearBlockfrostCredentialsMsg);

  router.addHandler(ROUTE, getHandler(service, keyRingService));
}
