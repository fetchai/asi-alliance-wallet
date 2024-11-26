import React, { FunctionComponent, useState } from "react";
import { Button, FormGroup, Input, Label } from "reactstrap";
import { useConfirm } from "@components/confirm";
import { FormattedMessage, useIntl } from "react-intl";
import { action, computed, makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { BIP44HDPath } from "@keplr-wallet/background";
import style from "./style.module.scss";
import { useStore } from "../../stores";

export class BIP44Option {
  @observable
  protected _coinType?: number;

  @observable
  protected _account: number = 0;

  @observable
  protected _change: number = 0;

  @observable
  protected _index: number = 0;

  constructor(coinType?: number) {
    this._coinType = coinType;

    makeObservable(this);
  }

  get coinType(): number | undefined {
    return this._coinType;
  }

  get account(): number {
    return this._account;
  }

  get change(): number {
    return this._change;
  }

  get index(): number {
    return this._index;
  }

  @computed
  get bip44HDPath(): BIP44HDPath {
    return {
      account: this.account,
      change: this.change,
      addressIndex: this.index,
    };
  }

  @action
  setCoinType(coinType: number | undefined) {
    this._coinType = coinType;
  }

  @action
  setAccount(account: number) {
    this._account = account;
  }

  @action
  setChange(change: number) {
    this._change = change;
  }

  @action
  setIndex(index: number) {
    this._index = index;
  }
}

// CONTRACT: Use with `observer`
export const useBIP44Option = (coinType?: number) => {
  const [bip44Option] = useState(() => new BIP44Option(coinType));

  return bip44Option;
};

export const AdvancedBIP44Option: FunctionComponent<{
  bip44Option: BIP44Option;
}> = observer(({ bip44Option }) => {
  const intl = useIntl();
  const { analyticsStore } = useStore();

  const confirm = useConfirm();

  const [error, setError] = useState("");

  const [isOpen, setIsOpen] = useState(
    bip44Option.account !== 0 ||
      bip44Option.change !== 0 ||
      bip44Option.index !== 0
  );
  const toggleOpen = async () => {
    if (isOpen) {
      if (
        await confirm.confirm({
          paragraph: intl.formatMessage({
            id: "register.bip44.confirm.clear",
          }),
        })
      ) {
        setIsOpen(false);
        bip44Option.setAccount(0);
        bip44Option.setChange(0);
        bip44Option.setIndex(0);
      }
    } else {
      setIsOpen(true);
    }
  };

  return (
    <React.Fragment>
      <Button
        className={style["advanced"]}
        type="button"
        color="link"
        onClick={(e) => {
          e.preventDefault();
          toggleOpen();
          analyticsStore.logEvent("register_advance_click", {
            pageName: "Register",
          });
        }}
      >
        <FormattedMessage id="register.bip44.button.advanced" />
      </Button>
      {isOpen ? (
        <FormGroup
          style={{
            marginBottom: 0,
          }}
        >
          <Label target="bip44-path" className="form-control-label">
            <FormattedMessage id="register.bip44.input.hd-path" />
          </Label>
          <div
            id="bip44-path"
            style={{
              display: "flex",
              alignItems: "baseline",
              color: "white",
              width: "410px",
            }}
          >
            <div style={{ margin: "5px" }}>{`m/44'/${
              bip44Option.coinType != null ? bip44Option.coinType : "···"
            }'/`}</div>
            <Input
              type="number"
              className="form-control-alternative"
              style={{
                width: "76.67px",
                textAlign: "right",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.10)",
                color: "white",
              }}
              value={bip44Option.account.toString()}
              onChange={(e) => {
                e.preventDefault();

                let value = e.target.value;
                if (value) {
                  if (value !== "0") {
                    // Remove leading zeros
                    for (let i = 0; i < value.length; i++) {
                      if (value[i] === "0") {
                        value = value.replace("0", "");
                      } else {
                        break;
                      }
                    }
                  }
                  const parsed = parseFloat(value);
                  // Should be integer and positive.
                  if (
                    Number.isInteger(parsed) &&
                    parsed >= 0 &&
                    parsed < Number.MAX_SAFE_INTEGER
                  ) {
                    bip44Option.setAccount(parsed);
                  }
                } else {
                  bip44Option.setAccount(0);
                }
              }}
            />
            <div style={{ margin: "5px" }}>{`'/`}</div>
            <Input
              type="number"
              className="form-control-alternative"
              style={{
                width: "76.67px",
                textAlign: "right",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.10)",
                color: "white",
              }}
              value={bip44Option.change.toString()}
              onChange={(e) => {
                e.preventDefault();

                let value = e.target.value;
                if (value) {
                  if (value !== "0") {
                    // Remove leading zeros
                    for (let i = 0; i < value.length; i++) {
                      if (value[i] === "0") {
                        value = value.replace("0", "");
                      } else {
                        break;
                      }
                    }
                  }
                  const parsed = parseFloat(value);
                  // Should be integer and positive.
                  if (
                    Number.isInteger(parsed) &&
                    (parsed === 0 || parsed === 1)
                  ) {
                    setError("");
                    bip44Option.setChange(parsed);
                  } else {
                    setError("Change value can only be either 0 or 1");
                  }
                } else {
                  bip44Option.setChange(0);
                  setError("");
                }
              }}
            />
            <div style={{ margin: "5px" }}>/</div>
            <Input
              type="number"
              className="form-control-alternative"
              style={{
                width: "76.67px",
                textAlign: "right",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.10)",
                color: "white",
              }}
              value={bip44Option.index.toString()}
              onChange={(e) => {
                e.preventDefault();

                let value = e.target.value;
                if (value) {
                  if (value !== "0") {
                    // Remove leading zeros
                    for (let i = 0; i < value.length; i++) {
                      if (value[i] === "0") {
                        value = value.replace("0", "");
                      } else {
                        break;
                      }
                    }
                  }
                  const parsed = parseFloat(value);
                  // Should be integer and positive.
                  if (
                    Number.isInteger(parsed) &&
                    parsed >= 0 &&
                    parsed < Number.MAX_SAFE_INTEGER
                  ) {
                    bip44Option.setIndex(parsed);
                  }
                } else {
                  bip44Option.setIndex(0);
                }
              }}
            />
          </div>
          {!!error && (
            <div
              style={{
                color: "#fb8c72",
                marginTop: "12px",
              }}
            >
              {error}
            </div>
          )}
        </FormGroup>
      ) : null}
    </React.Fragment>
  );
});
