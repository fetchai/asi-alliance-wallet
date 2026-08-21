import {
  camelToSnake,
  decodeGrantAuthorization,
  ObservableQueryMap,
  ObservableQueryTendermint,
  QuerySharedContext,
} from "../../../common";
import { ChainGetter } from "../../../chain";
import { Granter } from "./types";
import { setupAuthzExtension } from "@cosmjs/stargate";
import { AuthzExtension } from "@cosmjs/stargate/build/modules/authz/queries";
import { QueryGranterGrantsResponse } from "cosmjs-types/cosmos/authz/v1beta1/query";

export class ObservableQueryAuthZGranterInner extends ObservableQueryTendermint<Granter> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly granter: string
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      sharedContext,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as AuthzExtension;
        const response = await client.authz.granterGrants(granter);
        const decodedResponse = QueryGranterGrantsResponse.toJSON(response);
        const grantResponse = {
          ...decodedResponse,
          grants: decodedResponse.grants.map((item) => ({
            ...item,
            authorization: decodeGrantAuthorization(item.authorization),
            expiration: item.expiration,
          })),
        };
        return camelToSnake(grantResponse) as Granter;
      },
      setupAuthzExtension,
      `/cosmos/authz/v1beta1/grants/granter/${granter}?pagination.limit=1000`
    );
  }

  protected override canFetch(): boolean {
    return this.granter.length > 0;
  }
}

export class ObservableQueryAuthZGranter extends ObservableQueryMap<Granter> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super((granter) => {
      return new ObservableQueryAuthZGranterInner(
        sharedContext,
        chainId,
        chainGetter,
        granter
      );
    });
  }

  getGranter(granter: string): ObservableQueryAuthZGranterInner {
    return this.get(granter) as ObservableQueryAuthZGranterInner;
  }
}
