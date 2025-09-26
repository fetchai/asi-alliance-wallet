import React from "react";
import style from "./style.module.scss";

interface NoResultsProps {
  message?: string;
  styles?: React.CSSProperties;
}

export const NoResults: React.FC<NoResultsProps> = ({
  message = "No Results Found",
  styles,
}) => {
  return (
    <div className={style["noResultsContainer"]} style={styles ? styles : {}}>
      <img src={require("@assets/svg/not-found.svg")} alt="" />
      <div className={style["content"]}>{message}</div>
    </div>
  );
};
