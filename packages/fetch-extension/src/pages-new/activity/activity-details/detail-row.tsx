import React from "react";
import style from "./style.module.scss";
import { UncontrolledTooltip } from "reactstrap";

export const DetailRow = ({
  label,
  value,
  showTooltip = false,
  onClick,
}: {
  label: string;
  value: any;
  showTooltip?: boolean;
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
            {showTooltip && (
              <UncontrolledTooltip target="tooltip-detail-row">
                {value}
              </UncontrolledTooltip>
            )}
            <div
              id={showTooltip ? "tooltip-detail-row" : undefined}
              style={{
                cursor: showTooltip ? "pointer" : undefined,
              }}
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
