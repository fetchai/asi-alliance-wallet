import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { UncontrolledTooltip } from "reactstrap";

import style from "./style.module.scss";
import { useStore } from "../../stores";

interface TabProps {
  title: string;
  activeIcon?: string;
  icon: string;
  path: string;
  disabled: boolean;
  tooltip?: string;
  showDot?: boolean;
  dotColor?: string;
}

export const Tab = ({
  title,
  icon,
  path,
  disabled,
  tooltip,
  activeIcon,
  showDot,
  dotColor,
}: TabProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { analyticsStore } = useStore();

  const isChatActive =
    title == "Chat" &&
    (location.pathname == "/new-chat" ||
      location.pathname.startsWith("/chat/"));
  const isActive = path === location.pathname || isChatActive;

  return (
    <div
      id={title}
      className={`${style["tab"]} `}
      onClick={() => {
        if (!disabled) {
          if (path !== "/") {
            analyticsStore.logEvent(`${title.toLowerCase()}_tab_click`);
          }
          navigate(path);
        }
      }}
    >
      <div
        className={`${style["tab-icon"]} ${
          isActive ? style["active"] : disabled ? style["disabled"] : null
        }`}
        style={{ position: "relative" }}
      >
        <img
          draggable={false}
          src={isActive ? activeIcon : icon}
          alt="tab"
          width={17}
        />
        {showDot && !isActive ? (
          <span
            className={style["flashing-dot"]}
            style={{
              backgroundColor: dotColor || "var(--bg-green-base)",
            }}
          />
        ) : (
          ""
        )}
      </div>
      <div
        className={`${style["title"]} ${
          isActive ? style["active"] : disabled ? style["disabled"] : null
        }`}
      >
        {title}
      </div>
      {disabled && (
        <UncontrolledTooltip placement="top" target={title}>
          {tooltip}
        </UncontrolledTooltip>
      )}
    </div>
  );
};
