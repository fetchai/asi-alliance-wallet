/* eslint-disable react-hooks/exhaustive-deps */
import React from "react";
import { useIntl } from "react-intl";
import { useLocation, useNavigate } from "react-router";
import { useNotification } from "@components/notification";
import { ToolTip } from "@components/tooltip";
import chevronLeft from "@assets/icon/chevron-left.png";
import moreIcon from "@assets/icon/more-grey.png";
import { formatAddress } from "@utils/format";
import style from "./style.module.scss";
import { useStore } from "../../stores";
import { arrayify } from "@ethersproject/bytes";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { getAddress } from "@ethersproject/address";
import { fromBech32, toHex } from "@cosmjs/encoding";

export const UserNameSection = ({
  handleDropDown,
  addresses,
}: {
  handleDropDown: any;
  addresses: any;
}) => {
  const navigate = useNavigate();
  const notification = useNotification();
  const intl = useIntl();
  const { chainStore } = useStore();
  const current = chainStore.current;
  const isEvm = current.features?.includes("evm") ?? false;

  const userName = useLocation().pathname.split("/")[2];

  const contactName = (addresses: any) => {
    let val = "";
    for (let i = 0; i < addresses.length; i++) {
      if (
        (isEvm
          ? new Bech32Address(arrayify(addresses[i].address)).toBech32(
              current.bech32Config.bech32PrefixAccAddr
            )
          : addresses[i].address) == userName
      ) {
        val = addresses[i].name;
      }
    }
    return val;
  };

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(
      isEvm ? getAddress(toHex(fromBech32(address).data)) : address
    );
    notification.push({
      placement: "top-center",
      type: "success",
      duration: 2,
      content: intl.formatMessage({
        id: "main.address.copied",
      }),
      canDelete: true,
      transition: {
        duration: 0.25,
      },
    });
  };

  return (
    <div className={style["username"]}>
      <div className={style["leftBox"]}>
        <img
          alt=""
          draggable="false"
          className={style["backBtn"]}
          src={chevronLeft}
          onClick={() => {
            navigate(-1);
          }}
        />
        <span className={style["recieverName"]}>
          <ToolTip
            tooltip={
              contactName(addresses).length ? contactName(addresses) : userName
            }
            theme="dark"
            trigger="hover"
            options={{
              placement: "top",
            }}
          >
            <div className={style["user"]}>
              {contactName(addresses).length
                ? formatAddress(contactName(addresses))
                : formatAddress(userName)}
            </div>
          </ToolTip>
        </span>
        <span
          className={style["copyIcon"]}
          onClick={() => copyAddress(userName)}
        >
          <i className="fas fa-copy" />
        </span>
      </div>
      <div className={style["rightBox"]}>
        <img
          alt=""
          draggable="false"
          style={{ cursor: "pointer" }}
          className={style["more"]}
          src={moreIcon}
          onClick={(e) => {
            e.stopPropagation();
            handleDropDown();
          }}
          onBlur={handleDropDown}
        />
      </div>
    </div>
  );
};
