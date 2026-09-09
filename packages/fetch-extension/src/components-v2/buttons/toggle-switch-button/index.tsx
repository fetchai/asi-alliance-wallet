import React from "react";
import style from "./style.module.scss";

export const ToggleSwitchButton = ({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) => {
  return (
    <div>
      <label className={style["switch"]}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
        <span className={style["slider"]} />
      </label>
    </div>
  );
};
