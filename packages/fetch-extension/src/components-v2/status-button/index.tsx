import React from "react";
import style from "./style.module.scss";
import classNames from "classnames";

export const StatusButton = ({
  title,
  status,
}: {
  title: string;
  status: "Success" | "Pending" | "Active" | "Failed";
}) => {
  return (
    <div
      className={classNames(style["statusBtn"], style[status.toLowerCase()])}
    >
      {title}
    </div>
  );
};
