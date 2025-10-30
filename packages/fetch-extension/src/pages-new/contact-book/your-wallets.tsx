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

    const chainId = chainStore.current.chainId;

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
      console.log("[YourWallets] accountsAddress() called");
      const startTime = performance.now();

      const requester = new InExtensionMessageRequester();
      const msg = new ListAccountsMsg();
      const accounts = await requester.sendMessage(BACKGROUND_PORT, msg);

      console.log(
        `[YourWallets] ListAccountsMsg completed in ${(
          performance.now() - startTime
        ).toFixed(2)}ms, got ${accounts.length} accounts`
      );

      const currentWalletIds = keyRingStore.multiKeyStoreInfo.map(
        (ks) => ks.meta?.["__id__"] || ""
      );
      const selectedWalletId =
        keyRingStore.multiKeyStoreInfo.find((ks) => ks.selected)?.meta?.[
          "__id__"
        ] || "";

      const isEvm = chainStore.current.features?.includes("evm") ?? false;

      const addressesById: Record<string, string> = {};
      currentWalletIds.forEach((walletId, idx) => {
        const account = accounts[idx];
        if (account && walletId) {
          addressesById[walletId] = isEvm
            ? account.EVMAddress
            : account.bech32Address;
        }
      });

      const addresses = currentWalletIds
        .filter((walletId) => walletId && walletId !== selectedWalletId)
        .map((walletId) => addressesById[walletId] || "");

      console.log(
        `[YourWallets] Setting ${addresses.length} addresses:`,
        addresses.map((a) => a.slice(0, 15) + "...").join(", ")
      );
      setAddresses(addresses);
    };

    useEffect(() => {
      console.log(
        "[YourWallets] useEffect triggered, calling accountsAddress()"
      );
      accountsAddress();
    }, [keyRingStore.multiKeyStoreInfo]); // Re-run when wallets change

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
          renderResult={(keyStore, i) => {
            const nameByChain = keyStore.meta?.["nameByChain"]
              ? JSON.parse(keyStore.meta["nameByChain"])
              : {};

            const accountName =
              nameByChain?.[chainId] ||
              keyStore.meta?.["name"] ||
              intl.formatMessage({
                id: "setting.keyring.unnamed-account",
              });

            return (
              <Card
                key={i}
                heading={
                  <React.Fragment>
                    {accountName}
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
            );
          }}
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
