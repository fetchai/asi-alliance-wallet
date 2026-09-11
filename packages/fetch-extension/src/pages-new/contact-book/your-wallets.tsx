import React, { FunctionComponent, useEffect, useState } from "react";
import { Card } from "@components-v2/card";
import { SearchBar } from "@components-v2/search-bar";
import { getFilteredWallets, isPureEvmChain } from "@utils/filters";
import { formatAddress } from "@utils/format";
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";
import { useStore } from "../../stores";
import style from "./style.module.scss";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { GetCosmosKeysForEachVaultSettledMsg } from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { Skeleton } from "@components-v2/skeleton-loader";
import { NoResults } from "@components-v2/no-results";
import { getKeyInfoSocial, isPrivateKeyType } from "@utils/index";

interface YourWalletProps {
  selectWalletFromList: (recipient: string) => void;
  onBackButton: () => void;
}

export const YourWallets: FunctionComponent<YourWalletProps> = observer(
  ({ selectWalletFromList, onBackButton }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [addressByVaultId, setAddressByVaultId] = useState<
      Record<string, string>
    >({});
    const intl = useIntl();
    const { chainStore, keyRingStore } = useStore();

    const chainId = chainStore.current.chainId;

    const isEvm = isPureEvmChain(chainStore.current);

    useEffect(() => {
      const fetchAddresses = async () => {
        if (keyRingStore.keyInfos.length === 0) {
          setAddressByVaultId({});
          return;
        }

        const requester = new InExtensionMessageRequester();
        const msg = new GetCosmosKeysForEachVaultSettledMsg(
          chainId,
          keyRingStore.keyInfos.map((item) => item.id)
        );

        const settledResponse = await requester.sendMessage(
          BACKGROUND_PORT,
          msg
        );

        const next: Record<string, string> = {};
        for (const item of settledResponse) {
          if (item.status === "fulfilled" && item.value) {
            const address = isEvm
              ? item.value.ethereumHexAddress?.trim()
              : item.value.bech32Address?.trim();
            if (address) {
              next[item.value.vaultId] = address;
            }
          }
        }
        setAddressByVaultId(next);
      };

      fetchAddresses();
    }, [chainId, keyRingStore.keyInfos.length, isEvm]);

    const getOptionIcon = (keyStore: any) => {
      if (keyStore.type === "ledger") {
        return require("@assets/svg/wireframe/ledger-indicator.svg");
      }

      if (isPrivateKeyType(keyStore.type)) {
        const { email, socialType } = getKeyInfoSocial(keyStore);
        if (email && socialType === "apple") {
          return require("@assets/svg/wireframe/apple-logo.svg");
        }
        if (email && socialType === "google") {
          return require("@assets/svg/wireframe/google-logo.svg");
        }
      }
      return;
    };

    const keyRingList = keyRingStore.keyInfos.filter(
      (keyStore) => !keyStore.isSelected
    );

    return (
      <div className={style["container"]}>
        <SearchBar
          valuesArray={keyRingList}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          filterFunction={getFilteredWallets}
          emptyContent={<NoResults />}
          disabled={keyRingList?.length === 0}
          renderResult={(keyStore, i) => {
            const nameByChain = keyStore.insensitive?.keyRingMeta?.[
              "nameByChain"
            ]
              ? JSON.parse(keyStore.insensitive?.keyRingMeta?.["nameByChain"])
              : {};

            const accountName =
              nameByChain?.[chainId] ||
              keyStore.name ||
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
                  addressByVaultId[keyStore.id] ? (
                    formatAddress(addressByVaultId[keyStore.id])
                  ) : (
                    <Skeleton height="14px" width="100px" />
                  )
                }
                style={{
                  padding: "18px 16px",
                }}
                disabled={!addressByVaultId[keyStore.id]}
                onClick={async (e: any) => {
                  const address = addressByVaultId[keyStore.id];
                  if (address) {
                    e.preventDefault();
                    selectWalletFromList(address);
                    onBackButton?.();
                  }
                }}
              />
            );
          }}
        />
        {keyRingList?.length === 0 && (
          <NoResults
            message="You don’t have any other wallets added"
            styles={{
              height: "320px",
              rowGap: "0px",
            }}
            contentStyles={{
              color: "var(--font-dark)",
              textAlign: "center",
              fontSize: "24px",
              lineHeight: "34px",
              width: "320px",
            }}
            icon={
              <img
                src={require("@assets/svg/wireframe/no-address.svg")}
                alt=""
              />
            }
          />
        )}
      </div>
    );
  }
);
