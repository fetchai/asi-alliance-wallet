import React, { useState, useEffect } from "react";
import style from "./style.module.scss";
import { useNavigate } from "react-router";
import { useStore } from "../../../stores";
import { observer } from "mobx-react-lite";
import { Card } from "@components-v2/card";

export const WalletOptions = observer(
  ({ setIsOptionsOpen, setIsSelectWalletOpen }: any) => {
    const [accountIndex, setAccountIndex] = useState<number>(0);

    const navigate = useNavigate();
    const { keyRingStore, analyticsStore } = useStore();

    useEffect(() => {
      const firstAccountIndex = keyRingStore.multiKeyStoreInfo.findIndex(
        (value) => value.selected
      );
      setAccountIndex(firstAccountIndex);
    }, [keyRingStore.multiKeyStoreInfo]);

    return (
      <div className={style["container"]}>
        <Card
          heading={"Add new Wallet"}
          leftImage={require("@assets/svg/wireframe/plus.svg")}
          leftImageStyle={{
            backgroundColor: "transparent",
            height: "18px",
            width: "18px",
          }}
          onClick={(e: any) => {
            e.preventDefault();
            analyticsStore.logEvent("add_new_wallet_click", {
              pageName: "Home",
            });
            browser.tabs.create({
              url: "/popup.html#/register",
            });
          }}
        />

        <Card
          heading={"Change Wallet"}
          leftImage={require("@assets/svg/wireframe/change.svg")}
          leftImageStyle={{
            backgroundColor: "transparent",
            height: "18px",
            width: "18px",
          }}
          onClick={() => {
            setIsOptionsOpen(true);
            setIsSelectWalletOpen(false);
            analyticsStore.logEvent("change_wallet_click", {
              pageName: "Home",
            });
          }}
        />
        <Card
          heading={"Rename Wallet"}
          leftImage={require("@assets/svg/wireframe/rename.svg")}
          leftImageStyle={{
            backgroundColor: "transparent",
            height: "30px",
            width: "18px",
          }}
          onClick={(e: any) => {
            e.preventDefault();
            e.stopPropagation();
            analyticsStore.logEvent("rename_wallet_click", {
              pageName: "Home",
            });
            navigate(`/setting/keyring/change/name/${accountIndex}`);
          }}
        />
        <Card
          heading={"Delete Wallet"}
          leftImage={require("@assets/svg/wireframe/delete.svg")}
          leftImageStyle={{
            backgroundColor: "transparent",
            height: "30px",
            width: "18px",
          }}
          onClick={(e: any) => {
            e.preventDefault();
            e.stopPropagation();
            analyticsStore.logEvent("delete_wallet_click", {
              pageName: "Home",
            });
            navigate(`/setting/clear/${accountIndex}`);
          }}
          headingStyle={{
            fontSize: "16px",
            fontWeight: 400,
          }}
          style={{ color: "var(--orange-orange-400, #FA8F6B)" }}
        />
      </div>
    );
  }
);
