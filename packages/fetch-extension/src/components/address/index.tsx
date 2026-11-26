import React, { FunctionComponent } from "react";

import { ToolTip } from "../tooltip";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { PopperOptions } from "popper.js";

export interface AddressProps {
  children: React.ReactNode;
  tooltipFontSize?: string;
  tooltipAddress?: string;
  iconClass?: string;
  placement?: PopperOptions["placement"];
  childrenStyle?: React.CSSProperties;
}

export interface Bech32AddressProps {
  maxCharacters: number;
  lineBreakBeforePrefix?: boolean;
  isRaw?: false;
}

export interface RawAddressProps {
  isRaw: true;
}

export const Address: FunctionComponent<
  AddressProps & (Bech32AddressProps | RawAddressProps)
> = (props) => {
  const { tooltipFontSize, children } = props;
  const tooltipAddress =
    props.tooltipAddress || (typeof children === "string" ? children : "");

  if ("maxCharacters" in props) {
    const { lineBreakBeforePrefix } = props;

    const iconClass = [props.iconClass, "pr-2"].join(" ");

    return (
      <ToolTip
        trigger="hover"
        options={{ placement: props?.placement || "bottom-end" }}
        tooltipStyle={{
          background: "var(--bg-green-light)",
          width: "330px",
          color: "var(--font-dark)",
        }}
        tooltip={
          <div
            className="address-tooltip"
            style={{ fontSize: tooltipFontSize }}
          >
            {lineBreakBeforePrefix && tooltipAddress.length > 0
              ? tooltipAddress.split("1").map((item, i) => {
                  if (i === 0) {
                    return <div key={i}>{item + "1"}</div>;
                  }
                  return <div key={i}>{item}</div>;
                })
              : tooltipAddress}
          </div>
        }
        childrenStyle={{
          opacity: 0.6,
          color: "var(--font-secondary)",
          ...props.childrenStyle,
        }}
      >
        {props.iconClass ? <i className={iconClass} /> : ""}
        {typeof children === "string"
          ? Bech32Address.shortenAddress(children, props.maxCharacters)
          : children}
      </ToolTip>
    );
  }

  return (
    <ToolTip
      trigger="hover"
      options={{ placement: props?.placement || "top" }}
      tooltipStyle={{
        background: "var(--bg-green-light)",
        color: "var(--font-dark)",
      }}
      tooltip={
        <div className="address-tooltip" style={{ fontSize: tooltipFontSize }}>
          {tooltipAddress}
        </div>
      }
    >
      {children}
    </ToolTip>
  );
};
