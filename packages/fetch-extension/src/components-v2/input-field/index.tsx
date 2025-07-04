import React, { CSSProperties, ReactElement } from "react";
import style from "./style.module.scss";
import { Input } from "reactstrap";
import {
  disabledContainerStyle,
  disabledStyle,
  inputContainerStyle,
  inputStyle,
} from "./utils";
import classNames from "classnames";

interface Props {
  label: string;
  disabled?: boolean;
  value: string | number | undefined;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputContainerClassName?: string;
  placeholder?: string;
  rightIcon?: ReactElement;
  bottomContent?: ReactElement;
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
  bottomContent,
  inputContainerClassName,
  onClick,
  labelStyle,
}: Props) => {
  return (
    <div className={style["row-outer"]} onClick={onClick}>
      <div
        style={{
          color: "var(--font-secondary)",
          ...labelStyle,
        }}
        className={style[`label`]}
      >
        {label}
      </div>

      <div className={style["input"]}>
        <div
          className={classNames(
            style["inputContainer"],
            inputContainerClassName
          )}
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
        {bottomContent && bottomContent}
      </div>
    </div>
  );
};
