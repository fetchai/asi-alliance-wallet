import React, { FunctionComponent, useEffect, useState } from "react";
import { Card } from "@components-v2/card";
import { SearchBar } from "@components-v2/search-bar";
import { getFilteredWallets } from "@utils/filters";
import { formatAddress } from "@utils/format";
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";
import { useStore } from "../../stores";
import style from "./style.module.scss";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { ListAccountsMsg } from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { Skeleton } from "@components-v2/skeleton-loader";

interface YourWalletProps {
  selectWalletFromList: (recipient: string) => void;
  onBackButton: () => void;
}

export const YourWallets: FunctionComponent<YourWalletProps> = observer(
  ({ selectWalletFromList, onBackButton }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [addresses, setAddresses] = useState<string[]>([]);
    const intl = useIntl();
    const { chainStore, keyRingStore } = useStore();

    const getOptionIcon = (keyStore: any) => {
      if (keyStore.type === "ledger") {
        return require("@assets/svg/wireframe/ledger-indicator.svg");
      }

      if (keyStore.type === "privateKey") {
        if (
          keyStore.meta &&
          keyStore.meta?.["email"] &&
          keyStore.meta?.["socialType"] === "apple"
        ) {
          return require("@assets/svg/wireframe/apple-logo.svg");
        }

        if (
          keyStore.meta &&
          keyStore.meta?.["email"] &&
          keyStore.meta?.["socialType"] === "google"
        ) {
          return require("@assets/svg/wireframe/google-logo.svg");
        }
      }
      return;
    };

    const accountsAddress = async () => {
      const requester = new InExtensionMessageRequester();
      const msg = new ListAccountsMsg();
      const accounts = await requester.sendMessage(BACKGROUND_PORT, msg);
      const selectedAccountIndex = keyRingStore.multiKeyStoreInfo.findIndex(
        (value) => value.selected
      );

      const isEvm = chainStore.current.features?.includes("evm") ?? false;
      const addresses = accounts
        .map((account) => {
          if (isEvm) {
            return account.EVMAddress;
          }

          return account.bech32Address;
        })
        .filter((_, index) => index !== selectedAccountIndex);

      setAddresses(addresses);
    };

    useEffect(() => {
      accountsAddress();
    }, []);

    const keyRingList = keyRingStore.multiKeyStoreInfo.filter(
      (keyStore) => !keyStore.selected
    );

    return (
      <div className={style["container"]}>
        <SearchBar
          valuesArray={keyRingList}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          filterFunction={getFilteredWallets}
          disabled={keyRingList?.length === 0}
          renderResult={(keyStore, i) => (
            <Card
              key={i}
              heading={
                <React.Fragment>
                  {keyStore.meta?.["name"]
                    ? keyStore.meta["name"]
                    : intl.formatMessage({
                        id: "setting.keyring.unnamed-account",
                      })}
                  {getOptionIcon(keyStore) && (
                    <span className={style["rightIconContainer"]}>
                      <img
                        src={getOptionIcon(keyStore)}
                        alt="Right Section"
                        className={style["rightIcon"]}
                      />
                    </span>
                  )}
                </React.Fragment>
              }
              subheading={
                addresses[i] ? (
                  formatAddress(addresses[i])
                ) : (
                  <Skeleton height="14px" width="100px" />
                )
              }
              style={{
                padding: "18px 16px",
              }}
              disabled={addresses?.length === 0}
              onClick={async (e: any) => {
                if (addresses?.[i]) {
                  e.preventDefault();
                  const address = addresses[i];
                  selectWalletFromList(address);
                  onBackButton?.();
                }
              }}
            />
          )}
        />
        <div className={style["noAddressMessage"]}>
          {keyRingList?.length === 0 && (
            <React.Fragment>
              <img
                src={require("@assets/svg/wireframe/no-address.svg")}
                alt=""
              />
              <div className={style["message"]}>
                You don’t have any other wallets added
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    );
  }
);
