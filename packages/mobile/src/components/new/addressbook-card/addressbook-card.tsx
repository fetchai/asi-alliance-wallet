import React, { FunctionComponent, useEffect, useState } from "react";
import { CardModal } from "modals/card";
import { InteractionManager, Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { TabBarView } from "components/new/tab-bar/tab-bar";
import { RectButton } from "components/rect-button";
import { AddressBookConfig, AddressBookData } from "@keplr-wallet/hooks";
import { SearchIcon } from "components/new/icon/search-icon";
import { useStore } from "stores/index";
import { Button } from "components/button";
import { InputCardView } from "../card-view/input-card";
import { observer } from "mobx-react-lite";
import { SkeletonRow } from "./skeleton-row";
import { YourWalletsTab } from "./your-wallets-tab";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { ListAccountsMsg } from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { RNMessageRequesterInternal } from "../../../router";

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
}> = observer(
  ({
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
    const TABS = ["Your Wallets", "Other Addresses"] as const;
    type TabLabel = (typeof TABS)[number];
    const [activeTab, setActiveTab] = useState<TabLabel>("Your Wallets");
    const { chainStore, accountStore, analyticsStore, keyRingStore } =
      useStore();
    const chainId = chainStore.current.chainId;
    const account = accountStore.getAccount(chainId);

    const otherWallets = keyRingStore.multiKeyStoreInfo.filter(
      (k) => !k.selected
    );

    const [walletAddresses, setWalletAddresses] = useState<string[]>([]);
    const [isLoadingWallets, setIsLoadingWallets] = useState(false);

    useEffect(() => {
      if (!onSelectRecipient || !isOpen) return;
      setIsLoadingWallets(true);
      const task = InteractionManager.runAfterInteractions(async () => {
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
        } catch {
        } finally {
          setIsLoadingWallets(false);
        }
      });
      return () => task.cancel();
    }, [isOpen]);

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

        {(!showTabs || activeTab === "Other Addresses") && (
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
            {!addressBookConfig.isLoaded ? (
              <View style={style.flatten(["margin-top-10"]) as ViewStyle}>
                {[0, 1, 2].map((i) => (
                  <SkeletonRow key={i} wide />
                ))}
              </View>
            ) : filterAddressBook.length > 0 ? (
              <View style={style.flatten(["margin-top-10"]) as ViewStyle}>
                {filterAddressBook.map((data: IndexedItem<AddressBookData>) => {
                  return (
                    <BlurBackground
                      key={data.index.toString()}
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
                          addressBookConfig.selectAddressAt(data.index);
                          setSearch("");
                          close();
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
                    </BlurBackground>
                  );
                })}
              </View>
            ) : (
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
            )}
          </React.Fragment>
        )}

        {showTabs && activeTab === "Your Wallets" && onSelectRecipient && (
          <YourWalletsTab
            isLoadingWallets={isLoadingWallets}
            walletAddresses={walletAddresses}
            onSelectRecipient={onSelectRecipient}
            close={close}
          />
        )}
      </CardModal>
    );
  }
);
