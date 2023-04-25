/* eslint-disable react-hooks/exhaustive-deps */
import React, {
  createRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSelector } from "react-redux";
import { useHistory } from "react-router";
import { Chats, Group, GroupAddress, Groups } from "@chatTypes";
import { userChatGroups, userMessages } from "@chatStore/messages-slice";
import { userDetails } from "@chatStore/user-slice";
import { ChatMessage } from "@components/chat-message";
import { CHAT_PAGE_COUNT } from "../../config.ui.var";
import { deliverMessages, updateGroupTimestamp } from "@graphQL/messages-api";
import { recieveGroups, recieveMessages } from "@graphQL/recieve-messages";
import { useOnScreen } from "@hooks/use-on-screen";
import { useStore } from "../../stores";
import { decryptGroupTimestamp } from "@utils/decrypt-group";
import { NewUserSection } from "./new-user-section";
import style from "./style.module.scss";
import { ChatInputSection } from "@components/chat-input-section";

export const ChatsViewSection = ({
  isNewUser,
  isBlocked,
  targetPubKey,
  handleClick,
}: {
  isNewUser: boolean;
  isBlocked: boolean;
  targetPubKey: string;
  handleClick: any;
}) => {
  const history = useHistory();
  const targetAddress = history.location.pathname.split("/")[2];

  let enterKeyCount = 0;
  const user = useSelector(userDetails);
  const userGroups: Groups = useSelector(userChatGroups);
  const userChats: Chats = useSelector(userMessages);

  const { chainStore, accountStore } = useStore();
  const current = chainStore.current;
  const accountInfo = accountStore.getAccount(current.chainId);
  const preLoadedChats = useMemo(() => {
    return (
      userChats[targetAddress] || {
        messages: {},
        pagination: { lastPage: 0, page: -1, pageCount: CHAT_PAGE_COUNT },
      }
    );
  }, [Object.values(userChats[targetAddress]?.messages || []).length]);
  const [messages, setMessages] = useState<any[]>(
    Object.values(preLoadedChats?.messages) || []
  );

  const [pagination, setPagination] = useState(preLoadedChats?.pagination);
  const [group, setGroup] = useState<Group | undefined>(
    Object.values(userGroups).find((group) => group.id.includes(targetAddress))
  );

  const [loadingMessages, setLoadingMessages] = useState(false);

  const [newMessage, setNewMessage] = useState("");
  const [lastUnreadMesageId, setLastUnreadMesageId] = useState("");
  const [firstTimeOpen, setFirstTimeOpen] = useState(true);
  const [msgLen, setMsgLen] = useState(messages.length);
  const messagesStartRef: any = createRef();
  const messagesScrollRef: any = useRef(null);
  const isOnScreen = useOnScreen(messagesStartRef);

  useEffect(() => {
    const updatedMessages = Object.values(preLoadedChats?.messages).sort(
      (a, b) => {
        return parseInt(a.commitTimestamp) - parseInt(b.commitTimestamp);
      }
    );

    setMessages(updatedMessages);
    setPagination(preLoadedChats.pagination);

    const lastMessage =
      updatedMessages && updatedMessages.length > 0
        ? updatedMessages[updatedMessages.length - 1]
        : null;

    if (group?.id && lastMessage) {
      setTimeout(() => {
        updateGroupTimestamp(
          group?.id,
          user.accessToken,
          current.chainId,
          accountInfo.bech32Address,
          targetAddress,
          new Date(lastMessage.commitTimestamp),
          new Date(lastMessage.commitTimestamp)
        );
      }, 500);
    }
  }, [preLoadedChats]);

  const decryptGrpAddresses = async (
    groupAddress: GroupAddress,
    isSender: boolean
  ) => {
    if (groupAddress && groupAddress.groupLastSeenTimestamp) {
      const data = await decryptGroupTimestamp(
        current.chainId,
        groupAddress.groupLastSeenTimestamp,
        isSender
      );

      Object.assign(groupAddress, {
        groupLastSeenTimestamp: new Date(data).getTime(),
      });
    }
    if (groupAddress && groupAddress.lastSeenTimestamp) {
      const data = await decryptGroupTimestamp(
        current.chainId,
        groupAddress.lastSeenTimestamp,
        isSender
      );
      Object.assign(groupAddress, {
        lastSeenTimestamp: new Date(data).getTime(),
      });
    }

    return groupAddress;
  };

  const decryptGrp = async (group: Group) => {
    const tempGroup = { ...group };
    let tempSenderAddress: GroupAddress | undefined;
    let tempReceiverAddress: GroupAddress | undefined;

    /// Shallow copy
    /// Decrypting sender data
    const senderAddress = {
      ...group.addresses.find((val) => val.address !== targetAddress),
    };
    if (senderAddress)
      tempSenderAddress = await decryptGrpAddresses(
        senderAddress as GroupAddress,
        true
      );

    /// Decrypting receiver data
    const receiverAddress = {
      ...group.addresses.find((val) => val.address === targetAddress),
    };
    if (receiverAddress)
      tempReceiverAddress = await decryptGrpAddresses(
        receiverAddress as GroupAddress,
        false
      );

    /// Storing decryptin address into the group object and updating the UI
    if (tempSenderAddress && tempReceiverAddress) {
      const tempGroupAddress = [tempSenderAddress, tempReceiverAddress];
      tempGroup.addresses = tempGroupAddress;
      setGroup(tempGroup);
    }
  };
  useEffect(() => {
    /// Shallow copy
    const tempGroup = {
      ...Object.values(userGroups).find((group) =>
        group.id.includes(targetAddress)
      ),
    };
    decryptGrp(tempGroup as Group);
  }, [userGroups]);

  const messagesEndRef: any = useCallback(
    (node: any) => {
      /// Wait 300 m/s for design Rendering and then scroll
      if (node)
        setTimeout(() => {
          node.scrollIntoView({ block: "end" });
        }, 300);
    },
    [messages]
  );

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView(true);
    }
  }, [messagesEndRef.current]);

  useEffect(() => {
    const getChats = async () => {
      await loadUserList();
      if (pagination.page >= 0) {
        setTimeout(() => {
          messagesScrollRef.current?.scrollIntoView(true);
        }, 200);
      }
    };
    if (isOnScreen) getChats();
  }, [isOnScreen]);

  const loadUserList = async () => {
    if (loadingMessages) return;
    if (group) {
      const page = pagination?.page + 1 || 0;
      setLoadingMessages(true);
      await recieveMessages(
        targetAddress,
        receiver?.lastSeenTimestamp &&
          Number(group.lastMessageTimestamp) >
            Number(receiver.lastSeenTimestamp) &&
          page == 0
          ? receiver?.lastSeenTimestamp
          : null,
        page,
        group.isDm,
        group.id
      );
      setLoadingMessages(false);
    } else {
      const newPagination = pagination;
      newPagination.page = pagination.lastPage;
      setPagination(newPagination);
    }
  };

  const getDateValue = (d: any) => {
    const date = new Date(d);
    return date.getDate();
  };

  let prevDate = 0;
  const showDateFunction = (d: any) => {
    const date = getDateValue(d);

    if (prevDate !== date) {
      prevDate = date;
      return true;
    }
    return false;
  };

  const receiver = group?.addresses.find(
    (val) => val.address === targetAddress
  );
  useEffect(() => {
    if (msgLen + 1 == messages.length) {
      setFirstTimeOpen(false);
    }

    setMsgLen(messages.length);
    const time = group?.addresses.find((val) => val.address !== targetAddress)
      ?.lastSeenTimestamp;

    let idx = 0;

    messages
      .filter((message, index) => {
        if (message.commitTimestamp > Number(time)) {
          if (idx == 0) {
            idx = index;
          }
          return true;
        }
        return false;
      })
      .sort();

    if (idx != 0 && messages[idx].sender === targetAddress) {
      console.log("executed");
      if (firstTimeOpen) setLastUnreadMesageId(messages[idx - 1].id);
      else setLastUnreadMesageId(messages[idx].id);
    }
  }, [messages, group]);

  const handleSendMessage = async (e: any) => {
    e.preventDefault();
    if (newMessage.trim().length)
      try {
        const message = await deliverMessages(
          user.accessToken,
          current.chainId,
          newMessage,
          accountInfo.bech32Address,
          targetAddress
        );

        if (message) {
          const updatedMessagesList = [...messages, message];
          setMessages(updatedMessagesList);
          setLastUnreadMesageId("");
          setNewMessage("");
        }
        // scrollToBottom();
        recieveGroups(0, accountInfo.bech32Address);
      } catch (error) {
        console.log("failed to send : ", error);
      } finally {
        enterKeyCount = 0;
      }
  };

  const handleKeydown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    //it triggers by pressing the enter key
    const { key } = e as React.KeyboardEvent<HTMLTextAreaElement>;
    if (key === "Enter" && !e.shiftKey && enterKeyCount == 0) {
      enterKeyCount = 1;
      handleSendMessage(e);
    }
  };

  const decideUnreadMsgView = () => {
    if (firstTimeOpen)
      return (
        <div ref={messagesEndRef} className={style.separator}>
          <span className={style.separatorTest}>Unread messages</span>
        </div>
      );

    return <div ref={messagesEndRef} className={"AAAAA"} />;
  };

  const handleActionsClick = (data: string) => {
    setNewMessage("");
    handleClick(data);
  };

  return (
    <div
      className={`${style.chatArea} ${
        isNewUser ? style.showButton : style.hideButton
      }`}
    >
      <div className={style.messages}>
        {pagination?.lastPage <= pagination?.page && (
          <>
            {isNewUser && (
              <NewUserSection
                targetAddress={targetAddress}
                handleClick={handleActionsClick}
              />
            )}
            <p>
              Messages are end to end encrypted. Nobody else can read them
              except you and the recipient.
            </p>
          </>
        )}
        {pagination?.lastPage > pagination?.page &&
          (pagination?.page === -1 ||
            messages.length === 30 ||
            messages.length == 0) && (
            <div ref={messagesStartRef} className={style.loader}>
              Fetching older Chats <i className="fas fa-spinner fa-spin ml-2" />
            </div>
          )}
        {messages?.map((message: any, index) => {
          const check = showDateFunction(message?.commitTimestamp);
          return (
            <div key={message.id}>
              {group !== undefined && (
                <ChatMessage
                  chainId={current.chainId}
                  showDate={check}
                  message={message?.contents}
                  isSender={message?.sender === accountInfo.bech32Address} // if I am the sender of this message
                  timestamp={message?.commitTimestamp || 1549312452}
                  groupLastSeenTimestamp={
                    receiver && receiver.groupLastSeenTimestamp
                      ? new Date(receiver.groupLastSeenTimestamp).getTime()
                      : 0
                  }
                  disabled={true}
                />
              )}
              {index === CHAT_PAGE_COUNT && <div ref={messagesScrollRef} />}
              {message?.commitTimestamp &&
                receiver?.lastSeenTimestamp &&
                Number(message?.commitTimestamp) >
                  Number(receiver?.lastSeenTimestamp) &&
                message?.sender === targetAddress && (
                  <div className={messagesEndRef} />
                )}
              {lastUnreadMesageId === message.id && decideUnreadMsgView()}
            </div>
          );
        })}

        {lastUnreadMesageId === "" && (
          <div ref={messagesEndRef} className={"AAAAA"} />
        )}
      </div>
      <ChatInputSection
        placeholder={
          isBlocked ? "This contact is blocked" : "Type a new message..."
        }
        value={newMessage}
        onChange={(event) => {
          setNewMessage(event.target.value.substring(0, 499));
        }}
        onClick={handleSendMessage}
        onKeyDown={handleKeydown}
        disabled={isBlocked}
        isTargetPubKeyAvailable={targetPubKey.length ? true : false}
      />
    </div>
  );
};
