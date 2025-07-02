import { ToggleSwitchButton } from "@components-v2/buttons/toggle-switch-button";
import { useConfirm } from "@components/confirm";
import { BIP44HDPath } from "@keplr-wallet/background";
import { action, computed, makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { FormGroup, Input, Label } from "reactstrap";
import { useStore } from "../../stores";
import style from "./style.module.scss";

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
      <div className={style["advancedSection"]}>
        <div className={style["label"]}>
          <FormattedMessage id="register.bip44.button.advanced" />
        </div>
        <ToggleSwitchButton
          checked={isOpen}
          onChange={() => {
            toggleOpen();
            analyticsStore.logEvent("register_advance_click", {
              pageName: "Register",
            });
          }}
        />
      </div>
      {isOpen ? (
        <FormGroup
          style={{
            marginBottom: 0,
          }}
        >
          <Label target="bip44-path" className={style["label"]}>
            <FormattedMessage id="register.bip44.input.hd-path" />
          </Label>
          <div id="bip44-path" className={style["bip44PathSection"]}>
            <div className={style["pathSeperator"]}>{`m/44'/${
              bip44Option.coinType != null ? bip44Option.coinType : "···"
            }'/`}</div>
            <Input
              type="number"
              style={{
                width: "76.67px",
                textAlign: "right",
                borderRadius: "12px",
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
            <div className={style["pathSeperator"]}>{`'/`}</div>
            <Input
              type="number"
              style={{
                width: "76.67px",
                textAlign: "right",
                borderRadius: "12px",
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
            <div className={style["pathSeperator"]}>/</div>
            <Input
              type="number"
              style={{
                width: "76.67px",
                textAlign: "right",
                borderRadius: "12px",
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
