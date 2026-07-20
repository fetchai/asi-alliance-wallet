import { Router } from "@keplr-wallet/router";
import {
  GetChainInfosMsg,
  SuggestChainInfoMsg,
  RemoveSuggestedChainInfoMsg,
  GetChainInfosWithoutEndpointsMsg,
  ListNetworksMsg,
  GetNetworkMsg,
  SwitchNetworkByChainIdMsg,
  AddNetworkAndSwitchMsg,
  GetSelectedChainIdMsg,
  GetSelectedChainSnapshotMsg,
  SelectSelectedChainMsg,
  GetNetworkProjectionMsg,
  IssueSignSwitchTicketMsg,
  GetSignSwitchTicketValidMsg,
  ClearSignSwitchTicketMsg,
} from "./messages";
import { ROUTE } from "./constants";
import { getHandler } from "./handler";
import { ChainsService } from "./service";

export function init(router: Router, service: ChainsService): void {
  router.registerMessage(GetChainInfosMsg);
  router.registerMessage(GetChainInfosWithoutEndpointsMsg);
  router.registerMessage(SuggestChainInfoMsg);
  router.registerMessage(GetSelectedChainIdMsg);
  router.registerMessage(GetSelectedChainSnapshotMsg);
  router.registerMessage(GetNetworkProjectionMsg);
  router.registerMessage(SelectSelectedChainMsg);
  router.registerMessage(IssueSignSwitchTicketMsg);
  router.registerMessage(GetSignSwitchTicketValidMsg);
  router.registerMessage(ClearSignSwitchTicketMsg);
  router.registerMessage(RemoveSuggestedChainInfoMsg);
  router.registerMessage(GetNetworkMsg);
  router.registerMessage(ListNetworksMsg);
  router.registerMessage(SwitchNetworkByChainIdMsg);
  router.registerMessage(AddNetworkAndSwitchMsg);

  router.addHandler(ROUTE, getHandler(service));
}
