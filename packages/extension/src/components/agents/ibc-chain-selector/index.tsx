import React, { FunctionComponent, useState } from "react";
import {
  Button,
  ButtonDropdown,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  FormGroup,
  Label,
} from "reactstrap";

import style from "./style.module.scss";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { FormattedMessage } from "react-intl";
import { IBCChannelRegistrarModal } from "@components/form";
import { Channel } from "@keplr-wallet/hooks";
import { deliverMessages } from "@graphQL/messages-api";
import { useSelector } from "react-redux";
import { userDetails } from "@chatStore/user-slice";
import { useNotification } from "@components/notification";
import { useHistory } from "react-router";

export const IBCChainSelector: FunctionComponent<{
  label: string;
  disabled: boolean;
}> = observer(({ label, disabled }) => {
  const { accountStore, chainStore, ibcChannelStore } = useStore();
  const current = chainStore.current;
  const ibcChannelInfo = ibcChannelStore.get(current.chainId);
  const accountInfo = accountStore.getAccount(current.chainId);
  const history = useHistory();
  const targetAddress = history.location.pathname.split("/")[3];
  const notification = useNotification();
  const user = useSelector(userDetails);

  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel>();
  const [isIBCRegisterModalOpen, setIsIBCregisterModalOpen] = useState(false);

  const [selectorId] = useState(() => {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return `destination-${Buffer.from(bytes).toString("hex")}`;
  });

  const sendChannelDetails = async () => {
    if (selectedChannel) {
      const chainInfo = chainStore.getChain(
        selectedChannel.counterpartyChainId
      );

      const messagePayload = {
        channel: selectedChannel,
        message: `Selected Channel: ${chainInfo.chainName}`,
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
          content: `Failed to send selected Channel`,
          canDelete: true,
          transition: {
            duration: 0.25,
          },
        });
      }
    }
  };
  return (
    <React.Fragment>
      <IBCChannelRegistrarModal
        isOpen={isIBCRegisterModalOpen}
        closeModal={() => setIsIBCregisterModalOpen(false)}
        toggle={() => setIsIBCregisterModalOpen((value) => !value)}
      />
      <FormGroup>
        <Label for={selectorId} className="form-control-label">
          {label || (
            <FormattedMessage id="component.ibc.channel-registrar.chain-selector.label" />
          )}
        </Label>
        <ButtonDropdown
          disabled={disabled}
          id={selectorId}
          className={style.chainSelector}
          isOpen={isSelectorOpen}
          toggle={() => setIsSelectorOpen((value) => !value)}
        >
          <DropdownToggle caret>
            <FormattedMessage id="component.ibc.channel-registrar.chain-selector.placeholder" />
          </DropdownToggle>
          <DropdownMenu>
            {ibcChannelInfo.getTransferChannels().map((channel) => {
              if (!chainStore.hasChain(channel.counterpartyChainId)) {
                return undefined;
              }

              const chainInfo = chainStore.getChain(
                channel.counterpartyChainId
              );

              if (chainInfo) {
                return (
                  <DropdownItem
                    key={chainInfo.chainId}
                    onClick={(e) => {
                      e.preventDefault();
                      setSelectedChannel(channel);
                    }}
                  >
                    {chainInfo.chainName}
                    <div className={style.channel}>{channel.channelId}</div>
                  </DropdownItem>
                );
              }
            })}
            <DropdownItem
              onClick={(e) => {
                e.preventDefault();
                setIsIBCregisterModalOpen(true);
              }}
            >
              <i className="fas fa-plus-circle my-1 mr-1" />{" "}
              <FormattedMessage id="component.ibc.channel-registrar.chain-selector.button.add" />
            </DropdownItem>
          </DropdownMenu>
        </ButtonDropdown>
        <Button
          type="button"
          color="primary"
          size="small"
          style={{ marginTop: "15px" }}
          disabled={disabled || !selectedChannel}
          onClick={() => sendChannelDetails()}
        >
          Proceed
        </Button>
      </FormGroup>
    </React.Fragment>
  );
});
