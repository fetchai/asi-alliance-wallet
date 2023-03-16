import { NotyphiNotification } from "@notificationTypes";
import { timeSince } from "@utils/time-since-date";
import React, { FunctionComponent, useState } from "react";
import style from "./style.module.scss";
import ReactHtmlParser from "react-html-parser";
import jazzicon from "@metamask/jazzicon";
import { markDeliveryAsClicked } from "@utils/fetch-notification";
import { useStore } from "../../stores";
interface Props {
  elem: NotyphiNotification;
  onCrossClick: (deliveryId: string) => void;
  onFlagClick: (deliveryId: string, flag: boolean) => void;
}
export const NotificationItem: FunctionComponent<Props> = ({
  elem,
  onCrossClick,
  onFlagClick,
}) => {
  const [flag, setFlag] = useState(false);
  const { chainStore, accountStore } = useStore();
  const current = chainStore.current;
  const accountInfo = accountStore.getAccount(current.chainId);
  const { delivery_id, delivered_at } = elem;
  const elemDate = new Date(delivered_at);
  const time = timeSince(elemDate);

  const handleFlag = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!flag) {
      setFlag(true);
      onFlagClick(delivery_id, flag);
    }
  };

  const handleNavigateToUrl = () => {
    if (elem.cta_url != null) {
      const localNotifications = JSON.parse(
        localStorage.getItem(`notifications-${accountInfo.bech32Address}`) ||
          JSON.stringify([])
      );

      const unclickedNotifications: NotyphiNotification[] = localNotifications.filter(
        (notification: NotyphiNotification) =>
          notification.delivery_id !== delivery_id
      );

      markDeliveryAsClicked(elem.delivery_id, accountInfo.bech32Address).then(
        () => {
          localStorage.setItem(
            `notifications-${accountInfo.bech32Address}`,
            JSON.stringify(unclickedNotifications)
          );
          window.open(
            elem.cta_url.startsWith("http")
              ? elem.cta_url
              : `https:${elem.cta_url}`
          );
        }
      );
    }
  };

  const handleRead = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    onCrossClick(delivery_id);
  };

  return (
    <>
      <div className={style.notification} onClick={handleNavigateToUrl}>
        <div className={style.notificationHead}>
          <div className={style.notificationImage}>
            {elem.image_url ? (
              <img draggable={false} src={elem.image_url} />
            ) : (
              ReactHtmlParser(jazzicon(32, elem.delivery_id).outerHTML)
            )}
          </div>

          <p className={style.headName}>{elem.organisation_name}</p>
          <div className={style.notificationIcons}>
            <img
              draggable={false}
              src={require("@assets/svg/flag-icon.svg")}
              id={delivery_id}
              className={flag ? style.disabled : style.flag}
              onClick={handleFlag}
            />
            <img
              draggable={false}
              src={require("@assets/svg/cross-icon.svg")}
              className={style.cross}
              onClick={handleRead}
            />
          </div>
        </div>

        <p className={style.notificationTitle}>{elem.title}</p>

        <div className={style.notificationMsg}>
          <p>{elem.content}</p>
        </div>

        <div className={style.notificationTime}>
          <p>{time}</p>
        </div>
      </div>
      {flag && (
        <div className={style.flagged}>
          <p className={style.flaggedText}>
            Thanks for flagging this. We&apos;ll take a look at it
          </p>
        </div>
      )}
    </>
  );
};
