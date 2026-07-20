import React, { FunctionComponent, useEffect, useState } from "react";
import { CardModal } from "modals/card";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { TabBarView } from "components/new/tab-bar/tab-bar";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { RectButton } from "components/rect-button";
import { AddressBookConfig, AddressBookData } from "@keplr-wallet/hooks";
import { SearchIcon } from "components/new/icon/search-icon";
import { EmptyView } from "../empty";
import { useStore } from "stores/index";
import { Button } from "components/button";
import { InputCardView } from "../card-view/input-card";
import { ListAccountsMsg } from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { RNMessageRequesterInternal } from "../../../router";
import { Bech32Address } from "@keplr-wallet/cosmos";

interface IndexedItem<T> {
  index: number;
  item: T;
}

export const AddressBookCardModel: FunctionComponent<{
  hideCurrentAddress?: boolean;
  isOpen: boolean;
  close: () => void;
  title: string;
  addressBookConfig: AddressBookConfig;
  addAddressBook?: (add: boolean | undefined) => void;
  onSelectRecipient?: (address: string) => void;
}> = ({
  close,
  title,
  hideCurrentAddress = true,
  isOpen,
  addressBookConfig,
  addAddressBook,
  onSelectRecipient,
}) => {
  const style = useStyle();
  const [search, setSearch] = useState("");
  const TABS = ["Your wallets", "Other addresses"] as const;
  type TabLabel = (typeof TABS)[number];
  const [activeTab, setActiveTab] = useState<TabLabel>("Your wallets");
  const { chainStore, accountStore, analyticsStore, keyRingStore } = useStore();
  const chainId = chainStore.current.chainId;
  const account = accountStore.getAccount(chainId);

  const [walletAddresses, setWalletAddresses] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const requester = new RNMessageRequesterInternal();
        const accounts = await requester.sendMessage(
          BACKGROUND_PORT,
          new ListAccountsMsg()
        );
        const selectedIndex = keyRingStore.multiKeyStoreInfo.findIndex(
          (k) => k.selected
        );
        setWalletAddresses(
          accounts
            .map((a) => a.bech32Address)
            .filter((_, i) => i !== selectedIndex)
        );
      } catch (e) {
        console.log("Failed to fetch wallet addresses", e);
      }
    })();
  }, [isOpen]);

  const otherWallets = keyRingStore.multiKeyStoreInfo.filter(
    (k) => !k.selected
  );

  const [filterAddressBook, setFilterAddressBook] = useState<
    IndexedItem<AddressBookData>[]
  >([]);

  function deepFilterWithOriginalIndices<T>(
    arr: ReadonlyArray<T>,
    search: string,
    predicate: (item: T, search: string) => boolean
  ): IndexedItem<T>[] {
    const result: IndexedItem<T>[] = [];

    function deepFilter(arr: ReadonlyArray<T>): void {
      arr.forEach((item, index) => {
        if (predicate(item, search)) {
          result.push({ index, item });
        }
        if (Array.isArray(item)) {
          deepFilter(item);
        }
      });
    }

    deepFilter(arr);
    return result;
  }

  const predicate = (data: AddressBookData, search: string) =>
    data.name.toLowerCase().includes(search.toLowerCase()) &&
    hideCurrentAddress &&
    !data.address.includes(account.bech32Address);

  useEffect(() => {
    const searchTrim = search.trim();
    const newAddressBook = deepFilterWithOriginalIndices(
      addressBookConfig.addressBookDatas,
      searchTrim,
      predicate
    );
    setFilterAddressBook(newAddressBook);
  }, [addressBookConfig.addressBookDatas, search]);

  if (!isOpen) {
    return null;
  }

  const showTabs = onSelectRecipient && otherWallets.length > 0;

  return (
    <CardModal
      isOpen={isOpen}
      title={title}
      disableGesture={true}
      close={() => {
        setSearch("");
        close();
      }}
    >
      {showTabs ? (
        <TabBarView
          listItem={TABS}
          selected={activeTab}
          setSelected={(tab: TabLabel) => setActiveTab(tab)}
          containerStyle={style.flatten(["margin-bottom-16"]) as ViewStyle}
        />
      ) : null}

      {(!showTabs || activeTab === "Other addresses") && (
        <React.Fragment>
          <InputCardView
            placeholder="Search"
            value={search}
            onChangeText={(text: string) => {
              setSearch(text);
            }}
            rightIcon={<SearchIcon size={12} />}
            containerStyle={style.flatten(["margin-bottom-24"]) as ViewStyle}
          />
          {filterAddressBook.length > 0 ? (
            <View style={style.flatten(["margin-top-24"]) as ViewStyle}>
              {filterAddressBook.map((data: IndexedItem<AddressBookData>) => {
                return (
                  <RectButton
                    key={data.index.toString()}
                    onPress={() => {
                      addressBookConfig.selectAddressAt(data.index);
                      setSearch("");
                      close();
                    }}
                    activeOpacity={0.5}
                    style={
                      [
                        style.flatten([
                          "padding-12",
                          "border-radius-12",
                          "margin-bottom-4",
                          "background-color-gray-5",
                        ]),
                      ] as ViewStyle
                    }
                    underlayColor={"#e0e0e0"}
                  >
                    <Text
                      style={
                        style.flatten([
                          "body3",
                          "color-dark",
                          "padding-bottom-10",
                        ]) as ViewStyle
                      }
                    >
                      {data.item.name}
                    </Text>
                    <Text
                      style={
                        style.flatten([
                          "text-caption2",
                          "color-gray-300",
                        ]) as ViewStyle
                      }
                    >
                      {data.item.address}
                    </Text>
                  </RectButton>
                );
              })}
            </View>
          ) : filterAddressBook.length == 0 ? (
            <React.Fragment>
              <Text
                style={
                  style.flatten([
                    "body3",
                    "text-center",
                    "color-gray-400",
                    "margin-y-24",
                  ]) as ViewStyle
                }
              >
                {"You haven't saved any addresses yet"}
              </Text>
              <Button
                containerStyle={
                  style.flatten([
                    "border-radius-32",
                    "background-color-dark",
                  ]) as ViewStyle
                }
                textStyle={style.flatten([
                  "color-white",
                  "body2",
                  "font-normal",
                ])}
                text="Add an Address"
                onPress={() => {
                  if (addAddressBook) {
                    addAddressBook(true);
                    analyticsStore.logEvent("add_an_address_click", {
                      pageName: "Send",
                    });
                  }
                  close();
                }}
              />
            </React.Fragment>
          ) : (
            <EmptyView
              containerStyle={
                style.flatten(["relative", "height-214"]) as ViewStyle
              }
            />
          )}
        </React.Fragment>
      )}

      {showTabs && activeTab === "Your wallets" && (
        <View>
          {otherWallets.map((keyStore, i) => {
            const nameByChain = keyStore.meta?.["nameByChain"]
              ? JSON.parse(keyStore.meta["nameByChain"])
              : {};
            const accountName =
              nameByChain?.[chainId] ||
              keyStore.meta?.["name"] ||
              "Fetch Account";
            const address = walletAddresses[i];

            return (
              <BlurBackground
                key={i.toString()}
                borderRadius={12}
                blurIntensity={0}
                containerStyle={
                  [
                    style.flatten([
                      "margin-bottom-4",
                      "background-color-gray-5",
                    ]),
                  ] as ViewStyle
                }
              >
                <RectButton
                  onPress={() => {
                    if (address && onSelectRecipient) {
                      onSelectRecipient(address);
                      close();
                    }
                  }}
                  activeOpacity={0.5}
                  style={
                    style.flatten([
                      "padding-12",
                      "border-radius-12",
                    ]) as ViewStyle
                  }
                  underlayColor={"#e0e0e0"}
                >
                  <Text
                    style={
                      style.flatten([
                        "body3",
                        "color-dark",
                        "padding-bottom-10",
                      ]) as ViewStyle
                    }
                  >
                    {accountName}
                  </Text>
                  {address ? (
                    <Text
                      style={
                        style.flatten([
                          "text-caption2",
                          "color-gray-300",
                        ]) as ViewStyle
                      }
                    >
                      {Bech32Address.shortenAddress(address, 32)}
                    </Text>
                  ) : (
                    <View
                      style={{
                        height: 14,
                        width: 100,
                        borderRadius: 4,
                        backgroundColor: "#E0E0E0",
                      }}
                    />
                  )}
                </RectButton>
              </BlurBackground>
            );
          })}
        </View>
      )}
    </CardModal>
  );
};
