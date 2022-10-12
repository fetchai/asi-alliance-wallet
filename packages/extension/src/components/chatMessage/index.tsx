import classnames from "classnames";
import React, { useEffect, useState } from "react";
import { Container } from "reactstrap";
import deliveredIcon from "../../public/assets/icon/delivered.png";
import { decryptMessage } from "../../utils/decrypt-message";
import style from "./style.module.scss";

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const months: string[] = [
  "january",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const ChatMessage = ({
  chainId,
  message,
  isSender,
  timestamp,
  showDate,
}: {
  chainId: string;
  isSender: boolean;
  message: string;
  timestamp: number;
  showDate: boolean;
}) => {
  const [decryptedMessage, setDecryptedMessage] = useState("");

  useEffect(() => {
    decryptMessage(chainId, message, isSender)
      .then((message) => {
        setDecryptedMessage(message);
      })
      .catch((e) => {
        setDecryptedMessage(e.message);
      });
  }, [chainId, isSender, message]);

  // TODO(!!!): Should be replaced with `date-fns`
  const currentTime = (time: any) => {
    const d = new Date(time);
    if (d.getDate() === new Date().getDate()) {
      return {
        time: `${d.getHours()}:${d.getMinutes()}`,
        date: `Today`,
      };
    }
    if (d.getDate() === new Date().getDate() - 1) {
      return {
        time: `${d.getHours()}:${d.getMinutes()}`,
        date: `Yesterday`,
      };
    }
    return {
      time: `${d.getHours()}:${d.getMinutes()}`,
      date: `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`,
    };
  };

  return (
    <>
      <div className={style.currentDateContainer}>
        {" "}
        {showDate ? (
          <span className={style.currentDate}>
            {currentTime(timestamp).date}
          </span>
        ) : null}
      </div>
      <div className={isSender ? style.senderAlign : style.receiverAlign}>
        <Container
          fluid
          className={classnames(style.messageBox, {
            [style.senderBox]: isSender,
          })}
        >
          <div className={style.message}>{decryptedMessage}</div>
          <div className={style.timestamp}>
            {formatTime(timestamp)}
            {isSender && <img alt="" src={deliveredIcon} />}
          </div>
        </Container>
      </div>
    </>
  );
};
