import { Router } from "@keplr-wallet/router";
import {
  PingMsg,
  GetChainInfosWithCoreTypesMsg,
  SuggestChainInfoMsg,
  RemoveSuggestedChainInfoMsg,
  GetChainInfosWithoutEndpointsMsg,
  SetChainEndpointsMsg,
  ClearChainEndpointsMsg,
  GetChainOriginalEndpointsMsg,
  ClearAllSuggestedChainInfosMsg,
  ClearAllChainEndpointsMsg,
  GetChainInfoWithoutEndpointsMsg,
  NeedSuggestChainInfoInteractionMsg,
  SwitchNetworkByChainIdMsg,
  SetSelectedChainMsg,
  GetNetworkMsg,
} from "./messages";
import { ROUTE } from "./constants";
import { getHandler } from "./handler";
import { ChainsService } from "./service";
import { PermissionService } from "../permission";
import { PermissionInteractiveService } from "../permission-interactive";

export function init(
  router: Router,
  chainService: ChainsService,
  permissionService: PermissionService,
  permissionInteractiveService: PermissionInteractiveService
): void {
  router.registerMessage(PingMsg);
  router.registerMessage(GetChainInfosWithCoreTypesMsg);
  router.registerMessage(GetChainInfosWithoutEndpointsMsg);
  router.registerMessage(GetChainInfoWithoutEndpointsMsg);
  router.registerMessage(SuggestChainInfoMsg);
  router.registerMessage(NeedSuggestChainInfoInteractionMsg);
  router.registerMessage(RemoveSuggestedChainInfoMsg);
  router.registerMessage(SetChainEndpointsMsg);
  router.registerMessage(ClearChainEndpointsMsg);
  router.registerMessage(GetChainOriginalEndpointsMsg);
  router.registerMessage(ClearAllSuggestedChainInfosMsg);
  router.registerMessage(ClearAllChainEndpointsMsg);
  router.registerMessage(SwitchNetworkByChainIdMsg);
  router.registerMessage(SetSelectedChainMsg);
  router.registerMessage(GetNetworkMsg);
  router.addHandler(
    ROUTE,
    getHandler(chainService, permissionService, permissionInteractiveService)
  );
}
