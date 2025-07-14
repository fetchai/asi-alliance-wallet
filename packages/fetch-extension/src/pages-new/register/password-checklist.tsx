import classNames from "classnames";
import React, { useEffect } from "react";
import style from "./style.module.scss";

interface ValidationItemProps {
  isValid: boolean;
  text: string;
}

interface PasswordValidationChecklistProps {
  password: string;
  onStatusChange?: (status: boolean) => void;
}

const ValidationItem: React.FC<ValidationItemProps> = ({ isValid, text }) => (
  <div
    className={classNames(
      style["passwordValidationItem"],
      isValid
        ? style["passwordCheclistValid"]
        : style["passwordCheclistInvalid"]
    )}
  >
    <img
      src={
        isValid
          ? require("@assets/svg/wireframe/circle-check.svg")
          : require("@assets/svg/wireframe/circle-xmark.svg")
      }
      alt=""
    />{" "}
    {text}
  </div>
);

export const PasswordValidationChecklist: React.FC<
  PasswordValidationChecklistProps
> = ({ password, onStatusChange }) => {
  const validations = [
    {
      isValid: password.length >= 8,
      text: "At least 8 characters",
    },
    {
      isValid: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      text: "Minimum 1 special character",
    },
    {
      isValid: /[a-z]/.test(password),
      text: "Minimum 1 lowercase character",
    },
    {
      isValid: /[A-Z]/.test(password),
      text: "Minimum 1 uppercase character",
    },
  ];

  const isAllValid = validations.every((item) => item.isValid);

  useEffect(() => {
    if (onStatusChange) onStatusChange(isAllValid);
  }, [isAllValid, onStatusChange]);

  return (
    <div className={style["passwordValidationChecklist"]}>
      {validations.map((item, index) => (
        <ValidationItem key={index} isValid={item.isValid} text={item.text} />
      ))}
    </div>
  );
};
