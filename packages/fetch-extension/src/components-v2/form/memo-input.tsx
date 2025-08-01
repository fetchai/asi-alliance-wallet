import { IMemoConfig } from "@keplr-wallet/hooks";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import { FormFeedback, Input } from "reactstrap";
import style from "./memo.module.scss";
export interface MemoInputProps {
  memoConfig: IMemoConfig;
  value?: string;
  label?: string;
  className?: string;
  rows?: number;
  disabled?: boolean;
}

// TODO: Handle the max memo bytes length for each chain.
export const MemoInput: FunctionComponent<MemoInputProps> = observer(
  ({ memoConfig, value, rows, disabled = false }) => {
    const [inputId] = useState(() => {
      const bytes = new Uint8Array(4);
      crypto.getRandomValues(bytes);
      return `input-${Buffer.from(bytes).toString("hex")}`;
    });

    const error = memoConfig.error;
    const errorText: string | undefined = useMemo(() => {
      if (error) {
        switch (error.constructor) {
          default:
            return error.message;
        }
      }
    }, [error]);

    useEffect(() => {
      if (value) {
        memoConfig.setMemo(value);
      }
    }, [value]);

    return (
      <React.Fragment>
        <div className={style["label"]}>Memo</div>
        <div className={style["inputContainer"]}>
          <Input
            className={style["input"]}
            id={inputId}
            placeholder="Optional"
            type="textarea"
            rows={rows ? rows : 2}
            value={memoConfig.memo}
            onChange={(e) => {
              memoConfig.setMemo(e.target.value.substring(0, 256));
              e.preventDefault();
            }}
            autoComplete="off"
            disabled={disabled}
          />
        </div>
        {errorText != null ? (
          <FormFeedback style={{ display: "block" }}>{errorText}</FormFeedback>
        ) : null}
      </React.Fragment>
    );
  }
);
