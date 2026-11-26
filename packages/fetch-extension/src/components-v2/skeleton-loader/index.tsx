import React from "react";
import style from "./style.module.scss";

export const Skeleton = ({ height }: { height: string }) => {
  return <div style={{ height }} className={style["isLoading"]} />;
};
