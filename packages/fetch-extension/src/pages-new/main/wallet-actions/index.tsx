import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useStore } from "../../../stores";
import { observer } from "mobx-react-lite";
import { Card } from "@components-v2/card";
import style from "./style.module.scss";
import { Dropdown } from "@components-v2/dropdown";
import { TXNTYPE } from "../../../config";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { GetCardanoSyncStatusMsg } from "@keplr-wallet/background";
import {
  useMoonpayCurrency,
  checkAddressIsBuySellWhitelisted,
} from "@utils/moonpay-currency";
import { moonpaySupportedTokensByChainId } from "../../more/token/moonpay/utils";
import { getNativeBridgeModeByChainId } from "@utils/native-bridge-mode";

interface WalletActionsProps {
  isOpen: boolean;
  setIsOpen: any;
}
export const WalletActions: React.FC<WalletActionsProps> = observer(
  ({ isOpen, setIsOpen }) => {
    const navigate = useNavigate();

    const { accountStore, chainStore, activityStore, analyticsStore } =
      useStore();

    const chainId = chainStore.current.chainId;
    const accountInfo = accountStore.getAccount(chainId);
    const { data } = useMoonpayCurrency();
    const isCardanoChain =
      chainStore.current.features?.includes("cardano") ?? false;
    const [cardanoOutgoingPending, setCardanoOutgoingPending] = useState(false);

    useEffect(() => {
      if (!isCardanoChain) {
        setCardanoOutgoingPending(false);
        return;
      }
      let cancelled = false;
      let pollTimeout: ReturnType<typeof setTimeout> | null = null;
      const clearPoll = () => {
        if (pollTimeout != null) {
          clearTimeout(pollTimeout);
          pollTimeout = null;
        }
      };
      const poll = async () => {
        try {
          const requester = new InExtensionMessageRequester();
          const res = await requester.sendMessage(
            BACKGROUND_PORT,
            new GetCardanoSyncStatusMsg(
              chainId,
              document.hidden ? "background" : "foreground"
            )
          );
          if (!cancelled) {
            setCardanoOutgoingPending(
              (res as { hasOutgoingPendingSpend?: boolean })
                ?.hasOutgoingPendingSpend === true
            );
          }
        } catch {
          // Keep last known pending flag on transport/poll errors (avoid brief false unlock).
        }
        if (!cancelled) {
          clearPoll();
          pollTimeout = setTimeout(() => {
            pollTimeout = null;
            void poll();
          }, 2000);
        }
      };
      void poll();
      return () => {
        cancelled = true;
        setCardanoOutgoingPending(false);
        clearPoll();
      };
    }, [chainId, isCardanoChain]);

    const sendBlocked =
      activityStore.getPendingTxnTypes[TXNTYPE.send] || cardanoOutgoingPending;

    const allowedTokenList = data?.filter(
      (item: any) =>
        item?.type === "crypto" && (item?.isSellSupported || !item.isSuspended)
    );

    const moonpaySupportedTokens = moonpaySupportedTokensByChainId(
      chainId,
      allowedTokenList,
      chainStore.chainInfos
    );
    // const queryBalances = queries.queryBalances.getQueryBech32Address(
    //   accountInfo.bech32Address
    // );
    // const hasAssets =
    //   queryBalances.balances.find((bal) =>
    //     bal.balance.toDec().gt(new Dec(0))
    //   ) !== undefined;

    const nativeBridgeMode = getNativeBridgeModeByChainId(chainId);

    // check if address is whitelisted for Buy/Sell feature
    const isAddressWhitelisted = accountInfo?.bech32Address
      ? checkAddressIsBuySellWhitelisted(
          chainId === "1" || chainId === "injective-1"
            ? accountInfo.ethereumHexAddress || ""
            : accountInfo.bech32Address
        )
      : false;

    return (
      <div className={style["actions"]}>
        <Dropdown
          styleProp={{ color: "transparent" }}
          title={""}
          closeClicked={() => !isOpen}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
        >
          <Card
            leftImageStyle={{ background: "transparent", height: "16px" }}
            style={{
              background: "var(--card-bg)",
              height: "60px",
              marginBottom: "6px",
              opacity: sendBlocked ? "0.5" : "1",
            }}
            disabled={sendBlocked}
            leftImage={require("@assets/svg/wireframe/arrow-up.svg")}
            rightContent={
              sendBlocked && <i className="fas fa-spinner fa-spin ml-2 mr-2" />
            }
            heading={"Send"}
            onClick={() => {
              navigate("/send");
              analyticsStore.logEvent("send_click", {
                tabName: "fund_transfer_tab",
                pageName: "Home",
              });
            }}
          />

          <Card
            leftImageStyle={{ background: "transparent", height: "16px" }}
            style={{
              background: "var(--card-bg)",
              height: "60px",
              marginBottom: "6px",
            }}
            leftImage={require("@assets/svg/wireframe/arrow-down.svg")}
            heading={"Receive"}
            onClick={() => {
              navigate("/receive");
              analyticsStore.logEvent("receive_click", {
                tabName: "fund_transfer_tab",
                pageName: "Home",
              });
            }}
          />
          {moonpaySupportedTokens?.length > 0 &&
          !chainStore.current.beta &&
          isAddressWhitelisted ? (
            <Card
              leftImageStyle={{
                background: "transparent",
                height: "18px",
              }}
              style={{
                background: "var(--card-bg)",
                height: "60px",
                marginBottom: "6px",
              }}
              leftImage={require("@assets/svg/wireframe/plus-minus.svg")}
              heading="Buy / Sell"
              onClick={() => {
                navigate("/more/token/moonpay");
              }}
            />
          ) : (
            ""
          )}

          {nativeBridgeMode !== "none" ? (
            <Card
              leftImageStyle={{ background: "transparent", height: "18px" }}
              style={{
                background: "var(--card-bg)",
                height: "60px",
                marginBottom: "6px",
              }}
              leftImage={require("@assets/svg/wireframe/bridge.svg")}
              heading={"Bridge"}
              onClick={() => {
                navigate("/bridge");
                analyticsStore.logEvent("native_bridge_click", {
                  tabName: "fund_transfer_tab",
                  pageName: "Home",
                });
              }}
            />
          ) : (
            ""
          )}
        </Dropdown>
      </div>
    );
  }
);
