import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { store } from "@chatStore/index";
import { setIsChatSubscriptionActive } from "@chatStore/messages-slice";
import { GRAPHQL_URL } from "../config.ui.var";

export const client = new ApolloClient({
  uri: GRAPHQL_URL.MESSAGING_SERVER,
  cache: new InMemoryCache(),
});

export const httpLink = new HttpLink({
  uri: GRAPHQL_URL.MESSAGING_SERVER,
});

let link: GraphQLWsLink | null = null;

export const createWSLink = (token: string) => {
  if (link == null) {
    link = new GraphQLWsLink(
      createClient({
        url: GRAPHQL_URL.SUBSCRIPTION_SERVER,
        connectionParams: {
          authorization: `Bearer ${token}`,
        },
        on: {
          connecting: () => {
            console.log("connecting");
          },
          opened: () => {
            console.log("opened");
            store.dispatch(setIsChatSubscriptionActive(true));
          },
        },
      })
    );
  }
  return link;
};
