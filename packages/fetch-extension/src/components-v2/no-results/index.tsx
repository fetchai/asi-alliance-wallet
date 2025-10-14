import React from "react";
import style from "./style.module.scss";

interface NoResultsProps {
  message?: string;
  icon?: React.ReactNode;
  styles?: React.CSSProperties;
  contentStyles?: React.CSSProperties;
}

export const NoResults: React.FC<NoResultsProps> = ({
  message = "No Results Found",
  icon,
  styles,
  contentStyles,
}) => {
  return (
    <div className={style["noResultsContainer"]} style={styles ? styles : {}}>
      {icon ? (
        icon
      ) : (
        <img
          className={style["defaultIcon"]}
          src={require("@assets/svg/not-found.svg")}
          alt=""
        />
      )}
      <div
        className={style["content"]}
        style={contentStyles ? contentStyles : {}}
      >
        {message}
      </div>
    </div>
  );
};
