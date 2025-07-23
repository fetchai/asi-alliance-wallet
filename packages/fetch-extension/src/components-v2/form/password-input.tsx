import React, { forwardRef, useRef, useState } from "react";
import { Input, InputProps } from "./input";
import stylePasswordInput from "./password-input.module.scss";
import { Tooltip } from "reactstrap";
import { FormattedMessage } from "react-intl";
import classnames from "classnames";

interface PasswordInputProps
  extends Omit<
    InputProps & React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "onKeyUp" | "onKeyDown"
  > {
  passwordLabel?: string;
  containerStyle?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  floatLabel?: boolean;
}

// eslint-disable-next-line react/display-name
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (props, ref) => {
    const {
      passwordLabel = "Password",
      labelStyle,
      inputStyle,
      containerStyle,
      floatLabel,
      ...rest
    } = props;

    const internalRef = useRef<HTMLInputElement | null>(null);
    const [isOnCapsLock, setIsOnCapsLock] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    const handleRef = (node: HTMLInputElement | null) => {
      internalRef.current = node;
      if (ref) {
        if ("current" in ref) {
          ref.current = node;
        } else {
          ref(node);
        }
      }
    };

    return (
      <React.Fragment>
        {!floatLabel && (
          <div className={stylePasswordInput["text"]} style={labelStyle}>
            {passwordLabel}
          </div>
        )}

        <div
          className={classnames(
            stylePasswordInput["password-input-container"],
            floatLabel && stylePasswordInput["floating-group"]
          )}
          style={containerStyle}
        >
          <Input
            {...rest}
            formGroupClassName={stylePasswordInput["formGroup"]}
            className={classnames(
              stylePasswordInput["input"],
              floatLabel && stylePasswordInput["input"]
            )}
            style={{
              minWidth: "285px",
              display: "flex",
              ...inputStyle,
            }}
            label={floatLabel ? passwordLabel : undefined}
            placeholder={floatLabel ? " " : rest.placeholder}
            floatLabel={floatLabel}
            type={isPasswordVisible ? "text" : "password"}
            ref={handleRef}
            onKeyUp={(e) => setIsOnCapsLock(e.getModifierState("CapsLock"))}
            onKeyDown={(e) => setIsOnCapsLock(e.getModifierState("CapsLock"))}
            onChange={(e) => {
              const cleanedValue = e.target.value.replace(/\s/g, ""); // removes all spaces
              e.target.value = cleanedValue;
              if (rest.onChange) {
                rest.onChange(e);
              }
            }}
          />

          <img
            className={stylePasswordInput["eye"]}
            src={
              isPasswordVisible
                ? require("@assets/svg/wireframe/eye-2.svg")
                : require("@assets/svg/wireframe/eye.svg")
            }
            alt="Toggle visibility"
            onClick={() => setIsPasswordVisible((prev) => !prev)}
          />
        </div>
        {internalRef.current && (
          <Tooltip
            arrowClassName={stylePasswordInput["capslockTooltipArrow"]}
            placement="top-start"
            isOpen={isOnCapsLock}
            target={internalRef.current}
            fade
          >
            <FormattedMessage
              id="lock.alert.capslock"
              defaultMessage="Caps Lock is on"
            />
          </Tooltip>
        )}
      </React.Fragment>
    );
  }
);
