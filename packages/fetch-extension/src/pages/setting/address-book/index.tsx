import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { HeaderLayout } from "@layouts/index";
import { FormattedMessage, useIntl } from "react-intl";
import { useNavigate, useLocation } from "react-router";
import style from "../style.module.scss";
import {
  Button,
  ButtonDropdown,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  Modal,
  ModalBody,
} from "reactstrap";
import styleAddressBook from "./style.module.scss";
import { useStore } from "../../../stores";
import { PageButton } from "../page-button";
import { AddAddressModal } from "./add-address-modal";
import { ExtensionKVStore } from "@keplr-wallet/common";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { useConfirm } from "@components/confirm";
import {
  AddressBookSelectHandler,
  IIBCChannelConfig,
  useAddressBookConfig,
  useMemoConfig,
  useRecipientConfig,
} from "@keplr-wallet/hooks";
import { shortenAgentAddress } from "@utils/validate-agent";

export interface chatSectionParams {
  openModal: boolean;
  addressInputValue: string;
}
export const defaultParamValues: chatSectionParams = {
  openModal: false,
  addressInputValue: "",
};
export const AddressBookPage: FunctionComponent<{
  onBackButton?: () => void;
  hideChainDropdown?: boolean;
  selectHandler?: AddressBookSelectHandler;
  ibcChannelConfig?: IIBCChannelConfig;
}> = observer(
  ({ onBackButton, hideChainDropdown, selectHandler, ibcChannelConfig }) => {
    const intl = useIntl();
    const navigate = useNavigate();
    const { chainStore, uiConfigStore, analyticsStore } = useStore();
    const current = chainStore.current;
    const location = useLocation();
    const chatSectionParams =
      (location.state as chatSectionParams) || defaultParamValues;
    const [selectedChainId, setSelectedChainId] = useState(
      ibcChannelConfig?.channel
        ? ibcChannelConfig.channel.counterpartyChainId
        : current.chainId
    );

    const recipientConfig = useRecipientConfig(chainStore, selectedChainId, {
      allowHexAddressOnEthermint: true,
      icns: uiConfigStore.icnsInfo,
    });
    const memoConfig = useMemoConfig(chainStore, selectedChainId);

    const addressBookConfig = useAddressBookConfig(
      new ExtensionKVStore("address-book"),
      chainStore,
      selectedChainId,
      selectHandler
        ? selectHandler
        : {
            setRecipient: (): void => {
              // noop
            },
            setMemo: (): void => {
              // noop
            },
          }
    );

    const [dropdownOpen, setOpen] = useState(false);
    const toggle = () => setOpen(!dropdownOpen);

    const [addAddressModalOpen, setAddAddressModalOpen] = useState(
      chatSectionParams.openModal || false
    );
    const [addAddressModalIndex, setAddAddressModalIndex] = useState(-1);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      if (chatSectionParams.openModal) {
        setTimeout(() => {
          setLoading(false);
        }, 2000);
      } else {
        setLoading(false);
      }
    }, [chatSectionParams.openModal]);

    const confirm = useConfirm();
    const closeModal = () => {
      if (chatSectionParams.openModal) {
        navigate(-1);
      }
      setAddAddressModalOpen(false);
      setAddAddressModalIndex(-1);
    };
    const addressBookIcons = (index: number) => {
      return [
        <i
          key="edit"
          className="fas fa-pen"
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            analyticsStore.logEvent("edit_address_icon_click", {
              pageName: "Address Book",
            });
            setAddAddressModalOpen(true);
            setAddAddressModalIndex(index);
          }}
        />,
        <i
          key="remove"
          className="fas fa-trash"
          style={{ cursor: "pointer" }}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            analyticsStore.logEvent("delete_address_click", {
              action: confirm ? "Yes" : "No",
              pageName: "Address Book",
            });

            if (
              await confirm.confirm({
                img: (
                  <img
                    alt=""
                    src={require("@assets/img/trash.svg")}
                    style={{ height: "80px" }}
                  />
                ),
                title: intl.formatMessage({
                  id: "setting.address-book.confirm.delete-address.title",
                }),
                paragraph: intl.formatMessage({
                  id: "setting.address-book.confirm.delete-address.paragraph",
                }),
              })
            ) {
              setAddAddressModalOpen(false);
              setAddAddressModalIndex(-1);
              addressBookConfig.removeAddressBook(index);
            }
          }}
        />,
      ];
    };

    const handleAddressClick = (
      e: React.MouseEvent<HTMLDivElement>,
      address: string,
      i: number
    ) => {
      e.preventDefault();
      e.stopPropagation();
      if (!address.startsWith("agent")) {
        addressBookConfig.selectAddressAt(i);

        if (onBackButton) {
          onBackButton();
        }
      }
    };

    return (
      <HeaderLayout
        showChainName={false}
        canChangeChainInfo={false}
        alternativeTitle={intl.formatMessage({
          id: "main.menu.address-book",
        })}
        onBackButton={
          onBackButton
            ? onBackButton
            : () => {
                analyticsStore.logEvent("back_click", {
                  pageName: "Address Book",
                });
                navigate(-1);
              }
        }
      >
        <Modal
          isOpen={addAddressModalOpen}
          backdrop={false}
          className={styleAddressBook["fullModal"]}
          wrapClassName={styleAddressBook["fullModal"]}
          contentClassName={styleAddressBook["fullModal"]}
        >
          <ModalBody className={styleAddressBook["fullModal"]}>
            <AddAddressModal
              closeModal={() => closeModal()}
              recipientConfig={recipientConfig}
              memoConfig={memoConfig}
              addressBookConfig={addressBookConfig}
              index={addAddressModalIndex}
              chainId={selectedChainId}
            />
          </ModalBody>
        </Modal>
        {loading ? (
          <div className={styleAddressBook["loader"]}>Loading ....</div>
        ) : (
          <div className={style["container"]}>
            <div className={styleAddressBook["innerTopContainer"]}>
              {hideChainDropdown ? null : (
                <ButtonDropdown isOpen={dropdownOpen} toggle={toggle}>
                  <DropdownToggle caret style={{ boxShadow: "none" }}>
                    {chainStore.getChain(selectedChainId).chainName}
                  </DropdownToggle>

                  <DropdownMenu>
                    <div className={styleAddressBook["dropdownWrapper"]}>
                      {chainStore.chainInfos.map((chainInfo) => {
                        return (
                          <DropdownItem
                            key={chainInfo.chainId}
                            onClick={() => {
                              setSelectedChainId(chainInfo.chainId);
                            }}
                          >
                            {chainInfo.chainName}
                          </DropdownItem>
                        );
                      })}
                    </div>
                  </DropdownMenu>
                </ButtonDropdown>
              )}
              <div style={{ flex: 1 }} />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <Button
                  color="primary"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    analyticsStore.logEvent("add_new_address_click", {
                      pageName: "More",
                    });
                    setAddAddressModalOpen(true);
                  }}
                >
                  <i
                    className="fas fa-plus"
                    style={{ marginRight: "4px", fontSize: "8px" }}
                  />
                  <FormattedMessage id="setting.address-book.button.add" />
                </Button>
              </div>
            </div>
            <div style={{ flex: "1 1 0", overflowY: "auto" }}>
              {addressBookConfig.addressBookDatas.map((data, i) => {
                return (
                  <PageButton
                    key={i.toString()}
                    title={data.name}
                    paragraph={
                      data.address.indexOf(
                        chainStore.getChain(selectedChainId).bech32Config
                          .bech32PrefixAccAddr
                      ) === 0
                        ? Bech32Address.shortenAddress(data.address, 34)
                        : data.address.startsWith("agent")
                        ? shortenAgentAddress(data.address)
                        : data.address
                    }
                    subParagraph={data.memo}
                    icons={addressBookIcons(i)}
                    data-index={i}
                    disabled={onBackButton && data.address.startsWith("agent")}
                    onClick={(e) => handleAddressClick(e, data.address, i)}
                    style={{ cursor: selectHandler ? undefined : "auto" }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </HeaderLayout>
    );
  }
);
