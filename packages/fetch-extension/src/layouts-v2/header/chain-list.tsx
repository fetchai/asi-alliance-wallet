import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import { SearchBar } from "@components-v2/search-bar";
import { TabsPanel } from "@components-v2/tabs/tabsPanel-2";
import { useConfirm } from "@components/confirm";
import { messageAndGroupListenerUnsubscribe } from "@graphQL/messages-api";
import { formatAddress } from "@utils/format";
import classnames from "classnames";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useState } from "react";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { useStore } from "../../stores";
import style from "./chain-list.module.scss";
import { getFilteredChainValues } from "@utils/filters";
import { NotificationOption } from "@components-v2/notification-option";
import { NoResults } from "@components-v2/no-results";
interface ChainListProps {
  showAddress?: boolean;
  setIsSelectNetOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}
export const ChainList: FunctionComponent<ChainListProps> = observer(
  ({ showAddress, setIsSelectNetOpen }) => {
    const {
      chatStore,
      proposalStore,
      chainStore,
      analyticsStore,
      accountStore,
    } = useStore();
    const [cosmosSearchTerm, setCosmosSearchTerm] = useState("");
    const [evmSearchTerm, setEvmSearchTerm] = useState("");
    const [clickedChain, setClickedChain] = useState(
      chainStore.current.chainId
    );

    const intl = useIntl();
    const navigate = useNavigate();
    const confirm = useConfirm();

    const mainChainList = chainStore.chainInfosInUI.filter(
      (chainInfo) => !chainInfo.beta && !chainInfo.features?.includes("evm")
    );

    const evmChainList = chainStore.chainInfosInUI.filter((chainInfo) =>
      chainInfo.features?.includes("evm")
    );

    const betaChainList = chainStore.chainInfosInUI.filter(
      (chainInfo) => chainInfo.beta
    );

    const cosmosMainList = mainChainList.filter(
      (chainInfo) => chainInfo.raw.type !== "testnet"
    );

    const evmMainList = evmChainList.filter(
      (chainInfo) => chainInfo.raw.type !== "testnet"
    );

    const cosmosList = chainStore.showTestnet ? mainChainList : cosmosMainList;
    const evmList = chainStore.showTestnet ? evmChainList : evmMainList;

    const tabs = [
      {
        id: "Cosmos",
        component: (
          <div>
            <NotificationOption
              name="Show testnet"
              isChecked={chainStore.showTestnet}
              handleOnChange={() =>
                chainStore.toggleShowTestnet(!chainStore.showTestnet)
              }
              cardStyles={{
                background: "transparent",
                padding: "0px",
                marginBottom: "24px",
              }}
            />

            <SearchBar
              onSearchTermChange={setCosmosSearchTerm}
              searchTerm={cosmosSearchTerm}
              valuesArray={cosmosList}
              itemsStyleProp={{ height: "100%" }}
              filterFunction={getFilteredChainValues}
              emptyContent={<NoResults styles={{ height: "200px" }} />}
              midElement={
                <ButtonV2
                  styleProps={{
                    height: "48px",
                    marginTop: "0px",
                    fontSize: "14px",
                  }}
                  onClick={(e: any) => {
                    e.preventDefault();
                    analyticsStore.logEvent("manage_networks_click", {
                      pageName: "Home",
                    });
                    navigate("/manage-networks");
                  }}
                  text={"Manage networks"}
                />
              }
              renderResult={(chainInfo, index) => (
                <Card
                  key={index}
                  leftImage={
                    chainInfo.raw.chainSymbolImageUrl !== undefined
                      ? chainInfo.raw.chainSymbolImageUrl
                      : chainInfo.chainName
                      ? chainInfo.chainName[0].toUpperCase()
                      : ""
                  }
                  leftImageStyle={{
                    backgroundColor: !chainInfo.raw.chainSymbolImageUrl
                      ? "#dddfdf"
                      : "transparent",
                  }}
                  heading={chainInfo.chainName}
                  isActive={chainInfo.chainId === chainStore.current.chainId}
                  rightContent={
                    clickedChain === chainInfo.chainId
                      ? require("@assets/svg/wireframe/check.svg")
                      : ""
                  }
                  onClick={() => {
                    setClickedChain(chainInfo.chainId);
                    let properties = {};
                    if (chainInfo.chainId !== chainStore.current.chainId) {
                      properties = {
                        chainId: chainStore.current.chainId,
                        chainName: chainStore.current.chainName,
                        toChainId: chainInfo.chainId,
                        toChainName: chainInfo.chainName,
                      };
                    }
                    chainStore.selectChain(chainInfo.chainId);
                    chainStore.saveLastViewChainId();
                    chatStore.userDetailsStore.resetUser();
                    proposalStore.resetProposals();
                    chatStore.messagesStore.resetChatList();
                    chatStore.messagesStore.setIsChatSubscriptionActive(false);
                    messageAndGroupListenerUnsubscribe();

                    if (Object.values(properties).length > 0) {
                      analyticsStore.logEvent("chain_change_click", properties);
                    }
                    if (setIsSelectNetOpen) {
                      setIsSelectNetOpen(false);
                    }
                  }}
                  subheading={
                    showAddress
                      ? formatAddress(
                          accountStore.getAccount(chainInfo.chainId)
                            .bech32Address
                        )
                      : null
                  }
                />
              )}
            />
            {cosmosSearchTerm === "" && (
              <React.Fragment>
                {betaChainList.length > 0 && (
                  <div className={style["chain-title"]}>Beta support</div>
                )}

                {betaChainList.map((chainInfo) => (
                  <Card
                    key={chainInfo.chainId}
                    leftImage={
                      chainInfo.raw.chainSymbolImageUrl !== undefined
                        ? chainInfo.raw.chainSymbolImageUrl
                        : chainInfo.chainName
                        ? chainInfo.chainName[0].toUpperCase()
                        : ""
                    }
                    leftImageStyle={{
                      backgroundColor: !chainInfo.raw.chainSymbolImageUrl
                        ? "#dddfdf"
                        : "transparent",
                    }}
                    heading={chainInfo.chainName}
                    isActive={chainInfo.chainId === chainStore.current.chainId}
                    rightContent={require("@assets/svg/wireframe/closeImage.svg")}
                    rightContentStyle={{ height: "24px", width: "24px" }}
                    rightContentOnClick={async (e: any) => {
                      e.preventDefault();
                      e.stopPropagation();

                      if (
                        await confirm.confirm({
                          paragraph: intl.formatMessage(
                            {
                              id: "chain.remove.confirm.paragraph",
                            },
                            {
                              chainName: chainInfo.chainName,
                            }
                          ),
                        })
                      ) {
                        await chainStore.removeChainInfo(chainInfo.chainId);
                      }
                    }}
                    onClick={() => {
                      let properties = {};
                      if (chainInfo.chainId !== chainStore.current.chainId) {
                        properties = {
                          chainId: chainStore.current.chainId,
                          chainName: chainStore.current.chainName,
                          toChainId: chainInfo.chainId,
                          toChainName: chainInfo.chainName,
                        };
                      }
                      chainStore.selectChain(chainInfo.chainId);
                      chainStore.saveLastViewChainId();
                      chatStore.userDetailsStore.resetUser();
                      proposalStore.resetProposals();
                      chatStore.messagesStore.resetChatList();
                      chatStore.messagesStore.setIsChatSubscriptionActive(
                        false
                      );
                      messageAndGroupListenerUnsubscribe();
                      // navigate("/");
                      if (Object.values(properties).length > 0) {
                        analyticsStore.logEvent(
                          "chain_change_click",
                          properties
                        );
                      }
                      if (setIsSelectNetOpen) {
                        setIsSelectNetOpen(false);
                      }
                    }}
                    subheading={
                      showAddress
                        ? formatAddress(
                            accountStore.getAccount(chainInfo.chainId)
                              .bech32Address
                          )
                        : null
                    }
                  />
                ))}
              </React.Fragment>
            )}

            <a
              href="https://chains.keplr.app/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "none" }}
            >
              <div
                className={classnames(style["chainName"], style["addChain"])}
              >
                <div>
                  {intl.formatMessage({ id: "main.suggest.chain.link" })}
                </div>
              </div>
            </a>
          </div>
        ),
      },
      {
        id: "EVM",
        component: (
          <div>
            <NotificationOption
              name="Show testnet"
              isChecked={chainStore.showTestnet}
              handleOnChange={() =>
                chainStore.toggleShowTestnet(!chainStore.showTestnet)
              }
              cardStyles={{
                background: "transparent",
                padding: "0px",
                marginBottom: "24px",
              }}
            />
            <SearchBar
              searchTerm={evmSearchTerm}
              onSearchTermChange={setEvmSearchTerm}
              valuesArray={evmList}
              filterFunction={getFilteredChainValues}
              emptyContent={<NoResults styles={{ height: "200px" }} />}
              midElement={
                <ButtonV2
                  styleProps={{
                    height: "48px",
                    marginTop: "0px",
                    fontSize: "14px",
                  }}
                  onClick={(e: any) => {
                    e.preventDefault();
                    analyticsStore.logEvent("manage_networks_click", {
                      pageName: "Home",
                    });
                    navigate("/manage-networks");
                  }}
                  text={"Manage networks"}
                />
              }
              renderResult={(chainInfo, index) => (
                <Card
                  key={index}
                  leftImage={
                    chainInfo.raw.chainSymbolImageUrl !== undefined
                      ? chainInfo.raw.chainSymbolImageUrl
                      : chainInfo.chainName
                      ? chainInfo.chainName[0].toUpperCase()
                      : ""
                  }
                  leftImageStyle={{
                    backgroundColor: !chainInfo.raw.chainSymbolImageUrl
                      ? "#dddfdf"
                      : "transparent",
                  }}
                  heading={chainInfo.chainName}
                  isActive={chainInfo.chainId === chainStore.current.chainId}
                  rightContent={
                    clickedChain === chainInfo.chainId
                      ? require("@assets/svg/wireframe/check.svg")
                      : ""
                  }
                  onClick={() => {
                    setClickedChain(chainInfo.chainId);
                    let properties = {};
                    if (chainInfo.chainId !== chainStore.current.chainId) {
                      properties = {
                        chainId: chainStore.current.chainId,
                        chainName: chainStore.current.chainName,
                        toChainId: chainInfo.chainId,
                        toChainName: chainInfo.chainName,
                      };
                    }
                    chainStore.selectChain(chainInfo.chainId);
                    chainStore.saveLastViewChainId();
                    chatStore.userDetailsStore.resetUser();
                    proposalStore.resetProposals();
                    chatStore.messagesStore.resetChatList();
                    chatStore.messagesStore.setIsChatSubscriptionActive(false);
                    messageAndGroupListenerUnsubscribe();

                    if (Object.values(properties).length > 0) {
                      analyticsStore.logEvent("chain_change_click", properties);
                    }
                    if (setIsSelectNetOpen) {
                      setIsSelectNetOpen(false);
                    }
                  }}
                  subheading={
                    showAddress
                      ? formatAddress(
                          accountStore.getAccount(chainInfo.chainId)
                            .bech32Address
                        )
                      : null
                  }
                />
              )}
            />
          </div>
        ),
      },
    ];
    return (
      <div className={style["chainListContainer"]}>
        <TabsPanel
          tabs={tabs}
          onTabChange={(tabId: string) => {
            analyticsStore.logEvent(`${tabId.toLowerCase()}_tab_click`, {
              pageName: "Home",
            });
          }}
        />
      </div>
    );
  }
);
