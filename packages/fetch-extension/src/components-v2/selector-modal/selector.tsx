import React, { CSSProperties } from "react";
import style from "./style.module.scss";

export const SelectorModal = ({
  isOpen,
  close,
  items,
  selectedKey,
  setSelectedKey,
  modalPersistent,
  styleProps,
}: {
  isOpen: boolean;
  close: () => void;
  items: {
    label: string;
    key: string;
    icon?: string;
  }[];
  selectedKey: string | undefined;
  setSelectedKey: (key: string | undefined) => void;
  modalPersistent?: boolean;
  styleProps?: CSSProperties;
}) => {
  const renderBall = (selected: boolean) => {
    if (selected) {
      return (
        <img src={require("../../public/assets/svg/wireframe/check.svg")} />
      );
    } else {
      return null;
    }
  };

  if (!isOpen) {
    return null;
  }
  return (
    <div
      className={style["modal"]}
      style={{
        left: "0px",
        width: "100%",
        ...styleProps,
      }}
    >
      <div className={style["selector-container"]}>
        {items.map((item) => {
          return (
            <div
              className={style["selector-element"]}
              style={{
                background:
                  item.key === selectedKey
                    ? "var(--bg-green-light)"
                    : "var(--card-bg)",
              }}
              key={item.key}
              onClick={() => {
                setSelectedKey(item.key);
                if (!modalPersistent) {
                  close();
                }
              }}
            >
              <div
                style={{ display: "flex", gap: "12px", alignItems: "center" }}
              >
                {item?.icon && (
                  <img
                    style={{ width: 20, height: 15 }}
                    alt=""
                    src={item.icon}
                  />
                )}
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 400,
                  }}
                >
                  {item.label.trim()}
                </div>
              </div>
              {renderBall(item.key === selectedKey)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
