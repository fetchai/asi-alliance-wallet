import React, { FunctionComponent, useState } from "react";

import classnames from "classnames";
import styleCoinInput from "./coin-input.module.scss";

import { useIBCTransferConfig, useSendTxConfig } from "@keplr-wallet/hooks";
import { observer } from "mobx-react-lite";
import { FormattedMessage } from "react-intl";
import {
  Button,
  ButtonDropdown,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  FormGroup,
  Label,
} from "reactstrap";
import { useStore } from "../../../stores";
import { EthereumEndpoint } from "../../../config.ui";
import { deliverMessages } from "@graphQL/messages-api";
import { useHistory } from "react-router";
import { useSelector } from "react-redux";
import { userDetails } from "@chatStore/user-slice";
import { useNotification } from "@components/notification";

export const TokenDropdown: FunctionComponent<{
  label: string;
  disabled: boolean;
  ibc?: boolean;
}> = observer(({ label, disabled, ibc }) => {
  const { accountStore, chainStore, queriesStore } = useStore();
  const current = chainStore.current;
  const accountInfo = accountStore.getAccount(current.chainId);
  const history = useHistory();
  const targetAddress = history.location.pathname.split("/")[3];
  const notification = useNotification();
  const user = useSelector(userDetails);
  const sendConfigs = useSendTxConfig(
    chainStore,
    current.chainId,
    accountInfo.msgOpts.send,
    accountInfo.bech32Address,
    queriesStore.get(current.chainId).queryBalances,
    EthereumEndpoint
  );

  const ibcTransferConfigs = useIBCTransferConfig(
    chainStore,
    current.chainId,
    accountInfo.msgOpts.ibcTransfer,
    accountInfo.bech32Address,
    queriesStore.get(current.chainId).queryBalances,
    EthereumEndpoint
  );

  const { amountConfig } = ibc ? ibcTransferConfigs : sendConfigs;
  const queryBalances = queriesStore
    .get(amountConfig.chainId)
    .queryBalances.getQueryBech32Address(amountConfig.sender);

  const [randomId] = useState(() => {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString("hex");
  });

  const [isOpenTokenSelector, setIsOpenTokenSelector] = useState(false);

  const selectableCurrencies = amountConfig.sendableCurrencies
    .filter((cur) => {
      const bal = queryBalances.getBalanceFromCurrency(cur);
      return !bal.toDec().isZero();
    })
    .sort((a, b) => {
      return a.coinDenom < b.coinDenom ? -1 : 1;
    });

  const sendTokenDetails = async () => {
    const messagePayload = {
      token: amountConfig.sendCurrency,
      message: `Selected Token: ${amountConfig.sendCurrency.coinDenom}`,
    };
    try {
      await deliverMessages(
        user.accessToken,
        current.chainId,
        messagePayload,
        accountInfo.bech32Address,
        targetAddress
      );
    } catch (e) {
      console.log(e);
      notification.push({
        type: "warning",
        placement: "top-center",
        duration: 5,
        content: `Failed to send selected Token`,
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });
    }
  };
  return (
    <React.Fragment>
      <FormGroup>
        <Label
          for={`selector-${randomId}`}
          className="form-control-label"
          style={{ width: "100%" }}
        >
          {label || (
            <FormattedMessage id="component.form.coin-input.token.label" />
          )}
        </Label>
        <ButtonDropdown
          id={`selector-${randomId}`}
          className={classnames(styleCoinInput.tokenSelector, {
            disabled: amountConfig.isMax || disabled,
          })}
          isOpen={isOpenTokenSelector}
          toggle={() => setIsOpenTokenSelector((value) => !value)}
          disabled={amountConfig.isMax || disabled}
        >
          <DropdownToggle caret>
            {amountConfig.sendCurrency.coinDenom}
          </DropdownToggle>
          <DropdownMenu>
            {selectableCurrencies.map((currency) => {
              return (
                <DropdownItem
                  key={currency.coinMinimalDenom}
                  active={
                    currency.coinMinimalDenom ===
                    amountConfig.sendCurrency.coinMinimalDenom
                  }
                  onClick={(e) => {
                    e.preventDefault();

                    amountConfig.setSendCurrency(currency);
                  }}
                >
                  {currency.coinDenom}
                </DropdownItem>
              );
            })}
            {!ibc && (
              <DropdownItem
                onClick={(e) => {
                  e.preventDefault();
                  history.push({
                    pathname: "/setting/token/add",
                  });
                }}
              >
                <i className="fas fa-plus-circle my-1 mr-1" /> Add a token
              </DropdownItem>
            )}
          </DropdownMenu>
        </ButtonDropdown>
        <Button
          type="button"
          color="primary"
          size="small"
          style={{ marginTop: "15px" }}
          disabled={disabled}
          onClick={() => sendTokenDetails()}
        >
          Proceed
        </Button>
      </FormGroup>
    </React.Fragment>
  );
});
