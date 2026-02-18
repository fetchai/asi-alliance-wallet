import React from "react";
import style from "./style.module.scss";
import classNames from "classnames";

export const Checkbox: React.FC<{
  label: React.ReactNode;
  isChecked: boolean;
  className?: string;
  setIsChecked: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ label, isChecked, className, setIsChecked }) => {
  return (
    <div
      className={classNames(
        style["select-item"],
        isChecked ? style["selected"] : "",
        className
      )}
    >
      <span className={style["select-item-label"]}>{label}</span>
      <label className={style["select-checkbox-wrapper"]}>
        <input
          type="checkbox"
          onClick={() => {
            setIsChecked(!isChecked);
          }}
          checked={isChecked}
          readOnly
          tabIndex={-1}
        />
        <span className={style["select-checkbox"]} />
      </label>
    </div>
  );
};
