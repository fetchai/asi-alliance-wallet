import React, { CSSProperties, ReactElement } from "react";
import style from "./style.module.scss";
import { Input } from "reactstrap";
import {
  disabledContainerStyle,
  disabledStyle,
  inputContainerStyle,
  inputStyle,
} from "./utils";

interface Props {
  label: string;
  disabled?: boolean;
  value: string | number | undefined;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  rightIcon?: ReactElement;
  onClick?: () => void;
  labelStyle?: CSSProperties;
}

export const InputField = ({
  label,
  disabled,
  value,
  onChange,
  placeholder,
  rightIcon,
  onClick,
  labelStyle,
}: Props) => {
  return (
    <div className={style["row-outer"]} onClick={onClick}>
      <div
        style={{
          color: "rgba(255, 255, 255, 0.6)",
          ...labelStyle,
        }}
        className={style[`label`]}
      >
        {label}
      </div>

      <div
        className={style["input"]}
        style={disabled ? disabledContainerStyle : inputContainerStyle}
      >
        <Input
          width={"100%"}
          className="form-control-alternative"
          type={typeof value === "string" ? "text" : "number"}
          value={value}
          placeholder={placeholder ? placeholder : ""}
          onChange={onChange}
          disabled={disabled}
          style={disabled ? disabledStyle : inputStyle}
          min={0}
          autoComplete="off"
        />

        {rightIcon && rightIcon}
      </div>
    </div>
  );
};
