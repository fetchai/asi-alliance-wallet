import React, { forwardRef, useState } from "react";

import classnames from "classnames";

import {
  FormFeedback,
  FormGroup,
  FormText,
  InputGroup,
  Input as ReactStrapInput,
  Label,
} from "reactstrap";
import { InputType } from "reactstrap/lib/Input";

import styleInput from "./input.module.scss";

import { Buffer } from "buffer/";

export interface InputProps {
  type?: Exclude<InputType, "textarea">;
  label?: string;
  text?: string | React.ReactElement;
  error?: string;
  prepend?: React.ReactElement;
  append?: React.ReactElement;
  formGroupClassName?: string;
  inputGroupClassName?: string;
  formFeedbackClassName?: string;
  floatLabel?: boolean;
}

// eslint-disable-next-line react/display-name
export const Input = forwardRef<
  HTMLInputElement,
  InputProps & React.InputHTMLAttributes<HTMLInputElement>
>((props, ref) => {
  const {
    className,
    formGroupClassName,
    inputGroupClassName,
    formFeedbackClassName,
    type,
    label,
    text,
    error,
    prepend,
    append,
    floatLabel,
    // XXX: It's been so long I can't remember why I did this...
    color: _color,
    children: _children,
    ...attributes
  } = props;

  const [inputId] = useState(() => {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return `input-${Buffer.from(bytes).toString("hex")}`;
  });

  if (floatLabel) {
    return (
      <FormGroup
        className={classnames(styleInput["form-floating"], formGroupClassName)}
      >
        <ReactStrapInput
          id={inputId}
          type={type}
          placeholder=" "
          className={classnames("form-control", className, styleInput["input"])}
          innerRef={ref}
          {...attributes}
        />
        {label && <label htmlFor={inputId}>{label}</label>}
        {error ? (
          <FormFeedback style={{ display: "block" }}>{error}</FormFeedback>
        ) : text ? (
          <FormText>{text}</FormText>
        ) : null}
      </FormGroup>
    );
  }

  return (
    <FormGroup className={formGroupClassName}>
      {label ? (
        <Label for={inputId} className="form-control-label">
          {label}
        </Label>
      ) : null}
      <InputGroup className={inputGroupClassName}>
        {prepend}
        <ReactStrapInput
          id={inputId}
          className={classnames(
            "form-control-alternative",
            className,
            styleInput["input"]
          )}
          type={type}
          innerRef={ref}
          {...attributes}
        />
        {append}
      </InputGroup>
      {error ? (
        <FormFeedback
          style={{ display: "block" }}
          className={formFeedbackClassName}
        >
          {error}
        </FormFeedback>
      ) : text ? (
        <FormText>{text}</FormText>
      ) : null}
    </FormGroup>
  );
});
