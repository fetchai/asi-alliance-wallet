import React from "react";
import style from "./style.module.scss";

export const Checkbox: React.FC<{
  label: React.ReactNode;
  isChecked: boolean;
  setIsChecked: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ label, isChecked, setIsChecked }) => {
  return (
    <div
      className={`${style["select-item"]} ${
        isChecked ? style["selected"] : ""
      }`}
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
