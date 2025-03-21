import React from "react";
import style from "./style.module.scss";

export const DetailRow = ({
  label,
  value,
  onClick,
}: {
  label: string;
  value: any;
  onClick?: () => void;
}) => {
  return (
    <React.Fragment>
      <div className={style["container"]}>
        <div style={{ marginRight: "20px" }}>{label}</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <div onClick={onClick}>
            <div
              className={`${
                onClick ? style["versionClick"] : style["version"]
              }`}
            >
              {value}
            </div>
          </div>
          {onClick && (
            <img
              style={{ cursor: "pointer" }}
              onClick={onClick}
              src={require("@assets/svg/wireframe/copy.svg")}
              alt=""
            />
          )}
        </div>
      </div>
      <div className={style["hr"]} />
    </React.Fragment>
  );
};
