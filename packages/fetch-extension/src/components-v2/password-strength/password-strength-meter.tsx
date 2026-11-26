import React, { useEffect, useState } from "react";
import classNames from "classnames";
import style from "./password-strength.module.scss";
import type { ZXCVBNResult } from "zxcvbn";

interface PasswordStrengthMeterProps {
  password: string;
  onStrengthChange?: (strength: number) => void;
}

const strengthLabels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  password,
  onStrengthChange,
}) => {
  const [result, setResult] = useState<ZXCVBNResult | null>(null);
  useEffect(() => {
    let isMounted = true;

    const calculateStrength = async () => {
      if (!password) {
        setResult(null);
        onStrengthChange?.(0);
        return;
      }

      const { default: zxcvbn } = await import("zxcvbn");
      const evaluation = zxcvbn(password);

      if (isMounted) {
        setResult(evaluation);
      }
      onStrengthChange?.(evaluation.score);
    };

    calculateStrength();

    return () => {
      isMounted = false;
    };
  }, [password]);

  if (!password || !result) return null;

  const { score, feedback } = result;

  const getBarColor = () => {
    switch (score) {
      case 0:
      case 1:
        return style["weak"];
      case 2:
        return style["fair"];
      case 3:
      case 4:
        return style["strong"];
      default:
        return "";
    }
  };

  const getTextColor = () => {
    switch (score) {
      case 0:
      case 1:
        return style["weakText"];
      case 2:
        return style["fairText"];
      case 3:
      case 4:
        return style["strongText"];
      default:
        return "";
    }
  };

  return (
    <div className={style["passwordStrengthWrapper"]}>
      <div className={style["strengthHeader"]}>
        Password Strength:{" "}
        <span className={classNames(style["strengthLabel"], getTextColor())}>
          {strengthLabels[score]}
        </span>
      </div>
      <div className={style["progressBarContainer"]}>
        <div
          className={classNames(style["progressBar"], getBarColor())}
          style={{ width: `${(score + 1) * 20}%` }}
        />
      </div>
      {feedback.suggestions.length > 0 && (
        <ul className={style["suggestions"]}>
          {feedback.suggestions.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
