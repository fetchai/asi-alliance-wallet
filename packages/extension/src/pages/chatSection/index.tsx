import { ExtensionKVStore } from "@keplr-wallet/common";
import {
  useAddressBookConfig,
  useIBCTransferConfig,
} from "@keplr-wallet/hooks";
import React, {
  FunctionComponent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSelector } from "react-redux";
import { useHistory } from "react-router";
import { Input, InputGroup } from "reactstrap";
import { userMessages } from "../../chatStore/messages-slice";
import { userDetails } from "../../chatStore/user-slice";
import { ChatMessage } from "../../components/chatMessage";
import { ToolTip } from "../../components/tooltip";
import { EthereumEndpoint } from "../../config.ui";
import { deliverMessages } from "../../graphQL/messages-api";
import { HeaderLayout } from "../../layouts";
import bellIcon from "../../public/assets/icon/bell.png";
import chevronLeft from "../../public/assets/icon/chevron-left.png";
import moreIcon from "../../public/assets/icon/more-grey.png";
import paperAirplaneIcon from "../../public/assets/icon/paper-airplane.png";
import { useStore } from "../../stores";
import { fetchPublicKey } from "../../utils/fetch-public-key";
import { formatAddress } from "../../utils/format";
import { Menu } from "../main/menu";
import { Dropdown } from "./chat-actions-popup";
import style from "./style.module.scss";

export let openValue = true;

export const ChatSection: FunctionComponent = () => {
  const history = useHistory();
  const userName = history.location.pathname.split("/")[2];
  const allMessages = useSelector(userMessages);
  const oldMessages = useMemo(() => allMessages[userName] || {}, [
    allMessages,
    userName,
  ]);
  const [messages, setMessages] = useState(
    Object.values(oldMessages?.messages || [])
  );
  const user = useSelector(userDetails);

  const [newMessage, setNewMessage] = useState("");
  const [targetPubKey, setTargetPubKey] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const { chainStore, accountStore, queriesStore } = useStore();
  const current = chainStore.current;
  const accountInfo = accountStore.getAccount(current.chainId);

  const messagesEndRef: any = useRef();

  // address book values
  const queries = queriesStore.get(chainStore.current.chainId);
  const ibcTransferConfigs = useIBCTransferConfig(
    chainStore,
    chainStore.current.chainId,
    accountInfo.msgOpts.ibcTransfer,
    accountInfo.bech32Address,
    queries.queryBalances,
    EthereumEndpoint
  );

  const [selectedChainId] = useState(
    ibcTransferConfigs.channelConfig?.channel
      ? ibcTransferConfigs.channelConfig.channel.counterpartyChainId
      : current.chainId
  );

  const addressBookConfig = useAddressBookConfig(
    new ExtensionKVStore("address-book"),
    chainStore,
    selectedChainId,
    {
      setRecipient: (): void => {
        // noop
      },
      setMemo: (): void => {
        // noop
      },
    }
  );
  const addresses = addressBookConfig.addressBookDatas.map((data) => {
    return { name: data.name, address: data.address };
  });

  const contactName = (addresses: any) => {
    let val = "";
    for (let i = 0; i < addresses.length; i++) {
      if (addresses[i].address == userName) {
        val = addresses[i].name;
      }
    }
    return val;
  };

  const handleDropDown = () => {
    setShowDropdown(!showDropdown);
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

  const handleSendMessage = async (e: any) => {
    e.preventDefault();
    try {
      const data = await deliverMessages(
        user.accessToken,
        current.chainId,
        newMessage,
        accountInfo.bech32Address,
        userName
      );
      if (data?.dispatchMessages?.length > 0) {
        const newMessages = [...messages];
        newMessages.push({
          ...data.dispatchMessages[0],
          sender: accountInfo.bech32Address,
          target: userName,
        });
        setMessages(newMessages);
        setNewMessage("");
        messagesEndRef.current?.scrollIntoView({
          block: "end",
          behavior: "smooth",
        });
      }
    } catch (error) {
      console.log("failed to send : ", error);
    }
  };

  const handleKeydown = (e: { keyCode: number }) => {
    //it triggers by pressing the enter key
    if (e.keyCode === 13) {
      handleSendMessage(e);
    }
  };

  useEffect(() => {
    const setPublicAddress = async () => {
      const pubAddr = await fetchPublicKey(
        user.accessToken,
        current.chainId,
        userName
      );
      setTargetPubKey(pubAddr || "");
    };
    if (!oldMessages?.pubKey?.length) {
      setPublicAddress();
    }
  }, [oldMessages, user.accessToken, current.chainId, userName]);

  useEffect(() => {
    if (
      oldMessages?.lastMessage?.id &&
      !messages?.find(
        (message: any) => message?.id === oldMessages?.lastMessage?.id
      )
    ) {
      const newMessages = [...messages, oldMessages?.lastMessage];
      setMessages(newMessages);
    }
    // 👇️ scroll to bottom every time messages change
    messagesEndRef.current?.scrollIntoView({
      block: "end",
      behavior: "smooth",
    });
  }, [oldMessages, messages]);

  return (
    <HeaderLayout
      showChainName={true}
      canChangeChainInfo={true}
      menuRenderer={<Menu />}
      rightRenderer={
        <div
          style={{
            height: "64px",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            paddingRight: "20px",
          }}
        >
          <img
            src={bellIcon}
            alt="notification"
            style={{ width: "16px", cursor: "pointer" }}
            onClick={(e) => {
              e.preventDefault();

              history.push("/setting/set-keyring");
            }}
          />
        </div>
      }
    >
      <div className={style.username}>
        <div className={style.leftBox}>
          <img
            alt=""
            className={style.backBtn}
            src={chevronLeft}
            onClick={() => {
              history.goBack();
              openValue = false;
            }}
          />
          <span className={style.recieverName}>
            {contactName(addresses).length
              ? contactName(addresses)
              : formatAddress(userName)}
          </span>
        </div>
        <img
          alt=""
          style={{ cursor: "pointer" }}
          className={style.more}
          src={moreIcon}
          onClick={handleDropDown}
          onBlur={handleDropDown}
        />
      </div>

      <Dropdown
        added={true}
        showDropdown={showDropdown}
        setShowDropdown={setShowDropdown}
        blocked={oldMessages.isBlocked}
      />

      <div className={style.messages}>
        <p>
          Messages are end to end encrypted. Nobody else can read them except
          you and the recipient.
        </p>
        {messages
          ?.sort((a: any, b: any) => {
            return a.commitTimestamp - b.commitTimestamp;
          })
          ?.map((message: any, index) => {
            const check = showDateFunction(message?.commitTimestamp);
            return (
              <ChatMessage
                chainId={current.chainId}
                showDate={check}
                message={message?.contents}
                isSender={message?.target === userName} // if target was the user we are chatting with
                key={index}
                timestamp={message?.commitTimestamp || 1549312452}
              />
            );
          })}
        <div ref={messagesEndRef} />
      </div>

      <InputGroup className={style.inputText}>
        {targetPubKey.length ? (
          <Input
            className={`${style.inputArea} ${style["send-message-inputArea"]}`}
            placeholder="Type a new message..."
            value={newMessage}
            onChange={(event) => setNewMessage(event.target.value)}
            onKeyDown={handleKeydown}
            disabled={false}
          />
        ) : (
          <ToolTip
            trigger="hover"
            options={{ placement: "top" }}
            tooltip={<div>No transaction history found for this user</div>}
          >
            <Input
              className={`${style.inputArea} ${style["send-message-inputArea"]}`}
              placeholder="Type a new message..."
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              onKeyDown={handleKeydown}
              disabled={true}
            />
          </ToolTip>
        )}
        {newMessage?.length ? (
          <div
            className={style["send-message-icon"]}
            onClick={handleSendMessage}
          >
            <img src={paperAirplaneIcon} alt="" />
          </div>
        ) : (
          ""
        )}
      </InputGroup>
    </HeaderLayout>
  );
};