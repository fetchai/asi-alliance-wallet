import { HeaderLayout } from "@layouts-v2/header-layout";
import React, { useState, useEffect, FunctionComponent } from "react";
import { useStore } from "../../stores";
import style from "./style.module.scss";
// import { CHAINS } from "../../config.axl-brdige.var";
import { Card } from "@components-v2/card";
import { useNavigate } from "react-router";
import { SidePanelToggle } from "./side-panel";
import {
  GetSidePanelEnabledMsg,
  GetSidePanelIsSupportedMsg,
} from "@keplr-wallet/background";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { moonpaySupportedTokensByChainId } from "./token/moonpay/utils";
import {
  useMoonpayCurrency,
  checkAddressIsBuySellWhitelisted,
} from "@utils/moonpay-currency";
import * as manifest from "../../manifest.v3.json";
// import { CHAIN_ID_DORADO, CHAIN_ID_FETCHHUB } from "../../config.ui.var";

export const MorePage: FunctionComponent = () => {
  const [sidePanelSupported, setSidePanelSupported] = useState(false);
  const [sidePanelEnabled, setSidePanelEnabled] = useState(false);

  const {
    chainStore,
    analyticsStore,
    keyRingStore,
    accountStore,
    uiConfigStore,
  } = useStore();
  const navigate = useNavigate();
  const currentChain = chainStore.current;
  const chainId = currentChain.chainId;
  const accountInfo = accountStore.getAccount(chainId);
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

  // const isAxlViewVisible = CHAINS.some((chain) => {
  //   return chain.chainId?.toString() === chainStore.current.chainId;
  // });
  useEffect(() => {
    const msg = new GetSidePanelIsSupportedMsg();
    new InExtensionMessageRequester()
      .sendMessage(BACKGROUND_PORT, msg)
      .then((res) => {
        setSidePanelSupported(res.supported);

        const msg = new GetSidePanelEnabledMsg();
        new InExtensionMessageRequester()
          .sendMessage(BACKGROUND_PORT, msg)
          .then((res) => {
            setSidePanelEnabled(res.enabled);
          });
      });
  }, []);

  // const isEvm = chainStore.current.features?.includes("evm") ?? false;

  // check if address is whitelisted for Buy/Sell feature
  const isAddressWhitelisted = accountInfo?.bech32Address
    ? checkAddressIsBuySellWhitelisted(
        chainId === "1" || chainId === "injective-1"
          ? accountInfo.ethereumHexAddress || ""
          : accountInfo.bech32Address
      )
    : false;

  return (
    <HeaderLayout
      innerStyle={{
        marginTop: "0px",
        marginBottom: "0px",
      }}
      showChainName={true}
      canChangeChainInfo={true}
      showBottomMenu={true}
    >
      <div className={style["title"]}>More</div>
      {sidePanelSupported && (
        <Card
          leftImage={require("@assets/svg/wireframe/sidepanel.svg")}
          leftImageStyle={{
            background: "transparent",
            width: "30px",
            height: "25px",
          }}
          style={{
            background: "rgba(255,255,255,0.1)",
            marginBottom: "6px",
            padding: "14px 12px",
          }}
          headingStyle={{
            display: "flex",
            alignItems: "center",
          }}
          heading={
            <React.Fragment>
              <div>Switch to Side Panel</div>
            </React.Fragment>
          }
          subheading={"Open ASI Wallet in a sidebar on your screen"}
          rightContent={
            <SidePanelToggle
              sidePanelEnabled={sidePanelEnabled}
              setSidePanelEnabled={setSidePanelEnabled}
            />
          }
          rightContentStyle={{ marginBottom: "15px" }}
        />
      )}
      <Card
        leftImageStyle={{ background: "transparent" }}
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "6px" }}
        leftImage={require("@assets/svg/wireframe/security.svg")}
        heading={"Security & privacy"}
        onClick={() => {
          navigate("/more/security-privacy");
          analyticsStore.logEvent("security_and_privacy_click", {
            pageName: "More",
          });
        }}
      />
      <Card
        leftImageStyle={{ background: "transparent", height: "16px" }}
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "8px" }}
        leftImage={require("@assets/svg/wireframe/ibc-transfer-v2.svg")}
        heading={"IBC Transfer"}
        onClick={(e: any) => {
          e.preventDefault();
          analyticsStore.logEvent("ibc_transfer_click", {
            pageName: "More",
          });
          navigate("/ibc-transfer");
        }}
      />
      {currentChain?.raw?.type !== "testnet" &&
      moonpaySupportedTokens?.length > 0 &&
      !currentChain.beta &&
      isAddressWhitelisted ? (
        <Card
          leftImageStyle={{ background: "transparent" }}
          style={{
            background: "rgba(255,255,255,0.1)",
            marginBottom: "6px",
          }}
          leftImage={require("@assets/icon/moonpay.png")}
          heading="Buy/Sell Tokens"
          subheading="Using Moonpay"
          onClick={() => {
            navigate("/more/token/moonpay");
          }}
        />
      ) : (
        ""
      )}
      {chainStore.current.govUrl && (
        <Card
          leftImageStyle={{ background: "transparent" }}
          style={{ background: "rgba(255,255,255,0.1)", marginBottom: "8px" }}
          leftImage={require("@assets/svg/wireframe/proposal.svg")}
          heading={"Proposals"}
          onClick={(e: any) => {
            e.preventDefault();
            analyticsStore.logEvent("proposal_view_click", {
              pageName: "More",
            });
            navigate("/proposal");
          }}
        />
      )}
      <Card
        leftImageStyle={{ background: "transparent" }}
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "6px" }}
        leftImage={require("@assets/svg/wireframe/manage-tokens.svg")}
        heading={"Manage Tokens"}
        onClick={() => {
          navigate("/more/token/manage");
          analyticsStore.logEvent("manage_tokens_click", {
            pageName: "More",
          });
        }}
      />
      <Card
        leftImageStyle={{ background: "transparent", height: "18px" }}
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "6px" }}
        leftImage={require("@assets/svg/wireframe/at.svg")}
        heading={"Address Book"}
        onClick={() => {
          navigate("/more/address-book");
          analyticsStore.logEvent("address_book_click", {
            pageName: "More",
          });
        }}
      />
      <Card
        leftImageStyle={{ background: "transparent" }}
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "6px" }}
        leftImage={require("@assets/svg/wireframe/currency.svg")}
        heading={"Currency"}
        onClick={() => {
          navigate("/more/currency");
          analyticsStore.logEvent("currency_click", {
            pageName: "More",
          });
        }}
      />
      <Card
        leftImageStyle={{ background: "transparent" }}
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "6px" }}
        leftImage={require("@assets/svg/wireframe/language.svg")}
        heading={"Language"}
        onClick={() => {
          navigate("/more/language");
          analyticsStore.logEvent("language_click", {
            pageName: "More",
          });
        }}
      />
      <Card
        leftImageStyle={{ background: "transparent" }}
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "8px" }}
        leftImage={require("@assets/svg/wireframe/guide.svg")}
        heading={"Guide"}
        onClick={() =>
          window.open(
            "https://network.fetch.ai/docs/guides/asi-wallet/web-wallet/get-started",
            "_blank"
          )
        }
      />
      <Card
        leftImageStyle={{ background: "transparent" }}
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "6px" }}
        leftImage={require("@assets/svg/wireframe/chain-list-access.svg")}
        heading={"Link ASI Mobile Wallet"}
        onClick={() => {
          navigate("/more/export-to-mobile");
          analyticsStore.logEvent("link_asi_mobile_wallet_click", {
            pageName: "More",
          });
        }}
      />

      {/* 
       <Card
        leftImageStyle={{ background: "transparent" }}
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "6px" }}
        leftImage={require("@assets/svg/wireframe/notification.svg")}
        heading={"Notifications"}
        onClick={() => navigate("/more/notifications")}
      /> */}

      {/* {(chainStore.current.chainId === CHAIN_ID_FETCHHUB ||
        chainStore.current.chainId === CHAIN_ID_DORADO) && (
        <Card
          leftImageStyle={{ background: "transparent" }}
          style={{ background: "rgba(255,255,255,0.1)", marginBottom: "8px" }}
          leftImage={require("@assets/svg/wireframe/fns.svg")}
          heading={".FET Domains"}
          onClick={() => navigate("/fetch-name-service/explore")}
        />
      )} */}

      {/* 
      {isAxlViewVisible && (
        <Card
          leftImageStyle={{ background: "transparent" }}
          style={{ background: "rgba(255,255,255,0.1)", marginBottom: "8px" }}
          leftImage={require("@assets/svg/wireframe/axl-bridge.svg")}
          heading={"Axelar Bridge"}
          onClick={() =>
            isEvm ? navigate("/axl-bridge-evm") : navigate("/axl-bridge-cosmos")
          }
        />
      )} */}
      <Card
        leftImageStyle={{ background: "transparent" }}
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "5px" }}
        leftImage={require("@assets/svg/wireframe/wallet-version.svg")}
        rightContent={
          <div className={style["version"]}>
            {uiConfigStore.platform == "firefox" ? "None" : manifest.version}
          </div>
        }
        heading="Version"
      />
      <Card
        leftImageStyle={{
          background: "transparent",
          height: "16px",
          width: "24px",
        }}
        style={{ background: "rgba(255,255,255,0.1)", marginBottom: "8px" }}
        leftImage={require("@assets/svg/wireframe/sign-out.svg")}
        heading={"Sign out"}
        onClick={() => {
          keyRingStore.lock();
          analyticsStore.logEvent("sign_out_click");
          navigate("/");
        }}
      />
      <div
        style={{
          marginBottom: "40px",
        }}
      />
    </HeaderLayout>
  );
};
