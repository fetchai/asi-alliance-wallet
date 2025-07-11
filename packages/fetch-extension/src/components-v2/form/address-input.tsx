import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import { Button, FormText } from "reactstrap";
import { ContactBookPage } from "../../pages-new/contact-book";

import { Dropdown } from "@components-v2/dropdown";
import {
  EmptyAddressError,
  ICNSFailedToFetchError,
  ICNSIsFetchingError,
  IIBCChannelConfig,
  IMemoConfig,
  InvalidBech32Error,
  InvalidHexError,
  IRecipientConfig,
  IRecipientConfigWithICNS,
} from "@keplr-wallet/hooks";
import { validateAgentAddress } from "@utils/validate-agent";
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";
import {
  CHAIN_ID_DORADO,
  CHAIN_ID_ERIDANUS,
  CHAIN_ID_FETCHHUB,
} from "../../config.ui.var";
import { getBeneficiaryAddress } from "../../name-service/fns-apis";
import { useStore } from "../../stores";
import { Card } from "../card";
import styleAddressInput from "./address-input.module.scss";
import { TabsPanel } from "@components-v2/tabs/tabsPanel-2";
import { YourWallets } from "../../pages-new/contact-book/your-wallets";

export interface AddressInputProps {
  recipientConfig: IRecipientConfig | IRecipientConfigWithICNS;
  memoConfig?: IMemoConfig;
  ibcChannelConfig?: IIBCChannelConfig;

  className?: string;
  label?: string;

  disableAddressBook?: boolean;
  pageName?: string;
  disabled?: boolean;
  value: string;
}

function numOfCharacter(str: string, c: string): number {
  return str.split(c).length - 1;
}

export const AddressInput: FunctionComponent<AddressInputProps> = observer(
  ({
    recipientConfig,
    memoConfig,
    ibcChannelConfig,
    label,
    disableAddressBook,
    disabled = false,
    value,
    pageName,
  }) => {
    const intl = useIntl();
    const [isAddressBookOpen, setIsAddressBookOpen] = useState(false);
    const { analyticsStore } = useStore();

    const [inputId] = useState(() => {
      const bytes = new Uint8Array(4);
      crypto.getRandomValues(bytes);
      return `input-${Buffer.from(bytes).toString("hex")}`;
    });

    useEffect(() => {
      if (value) {
        recipientConfig.setRawRecipient(value);
      }
    }, [recipientConfig, value]);
    const error = recipientConfig.error;
    const errorText: string | undefined = useMemo(() => {
      if (error) {
        switch (error.constructor) {
          case EmptyAddressError:
            // No need to show the error to user.
            return;
          case InvalidBech32Error:
            return intl.formatMessage({
              id: "input.recipient.error.invalid-bech32",
            });
          case ICNSFailedToFetchError:
            return intl.formatMessage({
              id: "input.recipient.error.icns-failed-to-fetch",
            });
          case ICNSIsFetchingError:
            return;
          case InvalidHexError:
            return intl.formatMessage({
              id: "input.recipient.error.invalid-hex",
            });
          default:
            return intl.formatMessage({ id: "input.recipient.error.unknown" });
        }
      }
    }, [intl, error]);

    const isICNSName: boolean = (() => {
      if ("isICNSName" in recipientConfig) {
        return recipientConfig.isICNSName;
      }
      return false;
    })();

    const isICNSfetching: boolean = (() => {
      if ("isICNSFetching" in recipientConfig) {
        return recipientConfig.isICNSFetching;
      }
      return false;
    })();

    const selectAddressFromAddressBook = {
      setRecipient: (recipient: string) => {
        recipientConfig.setRawRecipient(recipient);
      },
      setMemo: (memo: string) => {
        if (memoConfig) {
          memoConfig.setMemo(memo);
        }
      },
    };

    const selectWalletFromList = (recipient: string) => {
      recipientConfig.setRawRecipient(recipient);
    };

    const [isFNSFecthing, setIsFNSFecthing] = useState(false);
    const getFETOwner = async (
      chainId: string,
      domainName: string
    ): Promise<string | null | undefined> => {
      const getBeneficiaryAddressObject = await getBeneficiaryAddress(
        chainId,
        domainName
      );
      const getAddress = getBeneficiaryAddressObject
        ? getBeneficiaryAddressObject.address
        : null;
      return getAddress;
    };

    const updateICNSvalue = (value: string) => {
      if (
        // If icns is possible and users enters ".", complete bech32 prefix automatically.
        "isICNSEnabled" in recipientConfig &&
        recipientConfig.isICNSEnabled &&
        value.length > 0 &&
        ![CHAIN_ID_DORADO, CHAIN_ID_FETCHHUB, CHAIN_ID_ERIDANUS].includes(
          recipientConfig.chainId
        ) &&
        value[value.length - 1] === "." &&
        numOfCharacter(value, ".") === 1 &&
        numOfCharacter(recipientConfig.rawRecipient, ".") === 0
      ) {
        value = value + recipientConfig.icnsExpectedBech32Prefix;
      }
      return value;
    };

    const updateFNSValue = async (value: string) => {
      if (
        [CHAIN_ID_DORADO, CHAIN_ID_FETCHHUB, CHAIN_ID_ERIDANUS].includes(
          recipientConfig.chainId
        ) &&
        value.length > 5 &&
        value.endsWith(".fet") &&
        numOfCharacter(value, ".") === 1
      ) {
        setIsFNSFecthing(true);

        recipientConfig.setRawRecipient(value);

        const FETOwner: any = await getFETOwner(recipientConfig.chainId, value);
        if (FETOwner) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          value = FETOwner;
        }
        setIsFNSFecthing(false);
      }
      return value;
    };

    const tabs = [
      {
        id: "Your wallets",
        component: (
          <YourWallets
            onBackButton={() => setIsAddressBookOpen(false)}
            selectWalletFromList={selectWalletFromList}
          />
        ),
      },
      {
        id: "Other addresses",
        component: (
          <ContactBookPage
            onBackButton={() => setIsAddressBookOpen(false)}
            selectHandler={selectAddressFromAddressBook}
            ibcChannelConfig={ibcChannelConfig}
          />
        ),
      },
    ];

    return (
      <React.Fragment>
        <div className={styleAddressInput["label"]}>{label}</div>
        <Card
          style={{
            padding: "12px 10px",
            background: "white",
            border: "1px solid var(--border-grey)",
          }}
          heading={""}
          subheading={
            <input
              placeholder="Wallet Address"
              id={inputId}
              className={styleAddressInput["input"]}
              value={recipientConfig.rawRecipient}
              onChange={async (e) => {
                let value = e.target.value;

                // If ICNS is availabe and users enters ".", complete postfix automatically.
                value = updateICNSvalue(value);

                // If FET owner is availabe and users enters ".", complete postfix automatically.
                value = await updateFNSValue(value);

                recipientConfig.setRawRecipient(value);
                e.preventDefault();
              }}
              autoComplete="off"
              disabled={disabled}
            />
          }
          rightContent={
            <div className={styleAddressInput["righContent"]}>
              <Button
                className={styleAddressInput["righContentButtons"]}
                disabled={true}
              >
                <img src={require("@assets/svg/wireframe/line-1.svg")} alt="" />
              </Button>
              <Button
                className={styleAddressInput["righContentButtons"]}
                disabled={true}
                onClick={() => {
                  analyticsStore.logEvent("recipient_address_click", {
                    pageName,
                  });
                }}
              >
                <img src={require("@assets/svg/wireframe/qrcode.svg")} alt="" />{" "}
              </Button>
              {!disableAddressBook && memoConfig ? (
                <Button
                  className={styleAddressInput["righContentButtons"]}
                  onClick={() => {
                    setIsAddressBookOpen(true);
                    analyticsStore.logEvent("recipient_address_click", {
                      pageName,
                    });
                  }}
                  disabled={disabled}
                >
                  <img src={require("@assets/svg/wireframe/at.svg")} alt="" />
                </Button>
              ) : null}
            </div>
          }
        />
        {isFNSFecthing ? (
          <div className={styleAddressInput["infoText"]}>
            <i className="fa fa-spinner fa-spin fa-fw" /> Fetching owner address
          </div>
        ) : null}
        {isICNSfetching ? (
          <FormText>
            <i className="fa fa-spinner fa-spin fa-fw" />
          </FormText>
        ) : null}
        {!isICNSfetching && isICNSName && !error ? (
          <FormText>{recipientConfig.recipient}</FormText>
        ) : null}
        {errorText != null &&
        !isFNSFecthing &&
        !recipientConfig.rawRecipient.startsWith("agent") ? (
          <div className={styleAddressInput["errorText"]}>{errorText}</div>
        ) : null}
        {recipientConfig.rawRecipient.startsWith("agent") &&
          validateAgentAddress(recipientConfig.rawRecipient) && (
            <div className={styleAddressInput["errorText"]}>
              Invalid agent address
            </div>
          )}

        <Dropdown
          isOpen={isAddressBookOpen}
          setIsOpen={setIsAddressBookOpen}
          title={"Choose recipient"}
          closeClicked={() => {
            setIsAddressBookOpen(false);
            analyticsStore.logEvent("add_new_address_click", {
              pageName,
            });
          }}
        >
          <TabsPanel tabs={tabs} />
        </Dropdown>
      </React.Fragment>
    );
  }
);
