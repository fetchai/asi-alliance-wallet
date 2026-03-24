import React, { useState, useEffect } from "react";
import style from "./style.module.scss";
import { useNavigate } from "react-router";
import { useStore } from "../../../stores";
import { observer } from "mobx-react-lite";
import { Card } from "@components-v2/card";

export const WalletOptions = observer(() => {
  const [accountIndex, setAccountIndex] = useState<string>("");

  const navigate = useNavigate();
  const { keyRingStore, analyticsStore } = useStore();

  useEffect(() => {
    const firstAccountIndex = keyRingStore.keyInfos.find(
      (value) => value.isSelected
    );
    setAccountIndex(firstAccountIndex?.id || "");
  }, [keyRingStore.keyInfos]);

  return (
    <div className={style["container"]}>
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
      />
    </div>
  );
});
