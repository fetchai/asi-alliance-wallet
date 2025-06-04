import React, { useMemo } from "react";
import { useNavigate } from "react-router";
import { useStore } from "../../../stores";
import { Dec } from "@keplr-wallet/unit";
import { observer } from "mobx-react-lite";
import { Card } from "@components-v2/card";
import style from "./style.module.scss";
import { Dropdown } from "@components-v2/dropdown";
import { TXNTYPE } from "../../../config";
import {
  useMoonpayCurrency,
  checkAddressIsBuySellWhitelisted,
} from "@utils/moonpay-currency";
import { moonpaySupportedTokensByChainId } from "../../more/token/moonpay/utils";

interface WalletActionsProps {
  isOpen: boolean;
  setIsOpen: any;
}
export const WalletActions: React.FC<WalletActionsProps> = observer(
  ({ isOpen, setIsOpen }) => {
    const navigate = useNavigate();

    const {
      accountStore,
      chainStore,
      queriesStore,
      activityStore,
      analyticsStore,
    } = useStore();

    const chainId = chainStore.current.chainId;
    const accountInfo = accountStore.getAccount(chainId);
    const queries = queriesStore.get(chainId);
    const { data } = useMoonpayCurrency();

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

    const stakable = queries.queryBalances.getQueryBech32Address(
      accountInfo.bech32Address
    ).stakable;
    const isStakableExist = useMemo(() => {
      return stakable.balance.toDec().gt(new Dec(0));
    }, [stakable.balance]);
    console.log(isStakableExist);

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
          title={"_"}
          closeClicked={() => !isOpen}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
        >
          <Card
            leftImageStyle={{ background: "transparent", height: "16px" }}
            style={{
              background: "rgba(255,255,255,0.1)",
              height: "60px",
              marginBottom: "6px",
              opacity: activityStore.getPendingTxnTypes[TXNTYPE.send]
                ? "0.5"
                : "1",
            }}
            disabled={activityStore.getPendingTxnTypes[TXNTYPE.send]}
            leftImage={require("@assets/svg/wireframe/arrow-up.svg")}
            rightContent={
              activityStore.getPendingTxnTypes[TXNTYPE.send] && (
                <i className="fas fa-spinner fa-spin ml-2 mr-2" />
              )
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
              background: "rgba(255,255,255,0.1)",
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
                background: "rgba(255,255,255,0.1)",
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

          <Card
            leftImageStyle={{ background: "transparent", height: "22px" }}
            style={{
              background: "rgba(255,255,255,0.1)",
              height: "60px",
              marginBottom: "6px",
            }}
            leftImage={require("@assets/svg/wireframe/bridge.svg")}
            heading={"Native Bridge"}
            onClick={() => {
              navigate("/bridge");
              analyticsStore.logEvent("native_bridge_click", {
                tabName: "fund_transfer_tab",
                pageName: "Home",
              });
            }}
          />
        </Dropdown>
      </div>
    );
  }
);
