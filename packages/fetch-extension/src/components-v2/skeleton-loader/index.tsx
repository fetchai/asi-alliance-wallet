import React from "react";
import style from "./style.module.scss";

export const Skeleton = ({
  height,
  width = "100%",
}: {
  height: string;
  width?: string;
}) => {
  return <div style={{ height, width }} className={style["isLoading"]} />;
};
