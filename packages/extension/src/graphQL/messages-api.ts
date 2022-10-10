import { ApolloClient, gql, InMemoryCache, split } from "@apollo/client";
import { getMainDefinition } from "@apollo/client/utilities";
import { store } from "../chatStore";
import { updateAuthorMessages } from "../chatStore/messages-slice";
import { encryptAllData } from "../utils/encrypt-message";
import { client, createWSLink, httpLink } from "./client";
import {
  block,
  blockedList,
  listenMessages,
  NewMessageUpdate,
  receiveMessages,
  sendMessages,
} from "./messages-queries";

export const fetchMessages = async () => {
  const state = store.getState();
  const { data } = await client.query({
    query: gql(receiveMessages),
    fetchPolicy: "no-cache",
    context: {
      headers: {
        Authorization: `Bearer ${state.user.accessToken}`,
      },
    },
  });
  console.log("data.mailbox.messages",data.mailbox.messages);
  
  return data.mailbox.messages;
};

export const fetchBlockList = async () => {
  const state = store.getState();
  const { data } = await client.query({
    query: gql(blockedList),
    fetchPolicy: "no-cache",
    context: {
      headers: {
        Authorization: `Bearer ${state.user.accessToken}`,
      },
    },
    variables: {
      channelId: "MESSAGING",
    },
  });

  console.log("blocked", data);
};

export const blockUser = async (address: string) => {
  const state = store.getState();
  const { data } = await client.mutate({
    mutation: gql(block),
    fetchPolicy: "no-cache",
    context: {
      headers: {
        Authorization: `Bearer ${state.user.accessToken}`,
      },
    },
    variables: {
      blockedAddress: address,
      channelId: "MESSAGING",
    },
  });

  console.log("blocked", data);
};

export const deliverMessages = async (
  accessToken: string,
  chainId: string,
  newMessage: any,
  senderAddress: string,
  targetAddress: string
) => {
  console.log("calling deliever messages","senderAddress",senderAddress,"targetAddress",targetAddress);
  
  const state = store.getState();
  try {
    if (newMessage) {
      const encryptedData = await encryptAllData(
        accessToken,
        chainId,
        newMessage,
        senderAddress,
        targetAddress
        );
        const { data } = await client.mutate({
          mutation: gql(sendMessages),
          variables: {
            messages: [
              {
                contents: `${encryptedData}`,
              },
            ],
          },
          context: {
            headers: {
              Authorization: `Bearer ${state.user.accessToken}`,
            },
          },
        });
        console.log("calling deliever inside loop",data);
      return data;
    }
  } catch (e) {
    console.log(e);
    return e;
  }
};

export const messageListener = () => {
  const state = store.getState();
  const wsLink = createWSLink(state.user.accessToken);
  const splitLink = split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return (
        definition.kind === "OperationDefinition" &&
        definition.operation === "subscription"
      );
    },
    wsLink,
    httpLink
  );
  const newClient = new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache(),
  });
  newClient
    .subscribe({
      query: gql(listenMessages),
      context: {
        headers: {
          authorization: `Bearer ${state.user.accessToken}`,
        },
      },
    })
    .subscribe({
      next({ data }: { data: { newMessageUpdate: NewMessageUpdate } }) {
        store.dispatch(updateAuthorMessages(data.newMessageUpdate.message));
      },
      error(err) {
        console.error("err", err);
      },
      complete() {
        console.log("completed");
      },
    });
};
