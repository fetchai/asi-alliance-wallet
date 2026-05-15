import React from "react";
import { useStore } from "../../../stores";
import { useNavigate } from "react-router";
import { DenomHelper } from "@keplr-wallet/common";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import { Hash } from "@keplr-wallet/crypto";
import { useLoadingIndicator } from "@components/loading-indicator";
import { useLanguage } from "../../../languages";
import { Card } from "@components-v2/card";
import { ToolTip } from "@components/tooltip";
import { formatTokenName } from "@utils/format";
import {
  WrongViewingKeyError,
  CARDANO_NATIVE_TOKEN_TYPE,
} from "@keplr-wallet/stores";
import { UncontrolledTooltip } from "reactstrap";
import { useNotification } from "@components/notification";
import { observer } from "mobx-react-lite";
import type { AppCurrency } from "@keplr-wallet/types";

/** Cardano token currencies may have isNft set at registration (queries.ts). */
type AppCurrencyWithNft = AppCurrency & { isNft?: boolean };

export const Tokens = observer(() => {
  const navigate = useNavigate();
  const language = useLanguage();
  const notification = useNotification();
  const fiatCurrency = language.fiatCurrency;
  const {
    chainStore,
    accountStore,
    queriesStore,
    tokensStore,
    priceStore,
    analyticsStore,
  } = useStore();
  const current = chainStore.current;
  const accountInfo = accountStore.getAccount(current.chainId);
  const loadingIndicator = useLoadingIndicator();
  const isCardano = current.features?.includes("cardano") ?? false;

  React.useEffect(() => {
    if (!isCardano) return;
    if (!accountInfo.bech32Address) return;

    // Re-discover native Cardano tokens (including newly received ASI) on Portfolio open.
    queriesStore
      .get(current.chainId)
      .cardano.refreshTokenBalancesForAddress(accountInfo.bech32Address);
  }, [accountInfo.bech32Address, current.chainId, isCardano, queriesStore]);

  // Token discovery is auto-triggered by ObservableQueryCardanoBalanceRegistry
  // when the ADA balance is first queried for this address (no manual trigger needed).

  const tokens = queriesStore
    .get(current.chainId)
    .queryBalances.getQueryBech32Address(accountInfo.bech32Address)
    .unstakables.filter((bal) => {
      if (
        chainStore.current.features &&
        chainStore.current.features.includes("terra-classic-fee")
      ) {
        const denom = new DenomHelper(bal.currency.coinMinimalDenom);
        if (denom.type !== "native" || denom.denom.startsWith("ibc/")) {
          return false;
        }
        if (denom.type === "native") {
          return bal.balance.toDec().gt(new Dec("0"));
        }
      }

      return true;
    })
    .sort((a, b) => {
      const aDecIsZero = a.balance.toDec().isZero();
      const bDecIsZero = b.balance.toDec().isZero();

      if (aDecIsZero && !bDecIsZero) {
        return 1;
      }
      if (!aDecIsZero && bDecIsZero) {
        return -1;
      }

      return a.currency.coinDenom < b.currency.coinDenom ? -1 : 1;
    });
  const convertToUsd = (balance: CoinPretty) => {
    const value = priceStore.calculatePrice(balance, fiatCurrency);
    const inUsd = value && value.shrink(true).maxDecimals(6).toString();
    return inUsd;
  };
  // Separate fungible tokens from NFTs for Cardano
  const fungibleTokens = isCardano
    ? tokens.filter((token) => {
        const denom = new DenomHelper(token.currency.coinMinimalDenom);
        if (denom.type === CARDANO_NATIVE_TOKEN_TYPE) {
          return !(token.currency as AppCurrencyWithNft).isNft;
        }
        return true;
      })
    : tokens;

  const nftTokens = isCardano
    ? tokens.filter((token) => {
        const denom = new DenomHelper(token.currency.coinMinimalDenom);
        return (
          denom.type === CARDANO_NATIVE_TOKEN_TYPE &&
          (token.currency as AppCurrencyWithNft).isNft
        );
      })
    : [];

  return (
    <React.Fragment>
      {fungibleTokens.map((token) => {
        const error = token.error;
        const validSelector = Buffer.from(
          Hash.sha256(
            Buffer.from(
              token.balance.currency.coinMinimalDenom
            ) as unknown as Uint8Array
          )
        )
          .toString("hex")
          .replace(/\d+/g, "")
          .slice(0, 20);
        const createViewingKey = async (): Promise<string | undefined> => {
          if (
            "type" in token.balance.currency &&
            token.balance.currency.type === "secret20"
          ) {
            const contractAddress = token.balance.currency.contractAddress;
            return new Promise((resolve) => {
              accountInfo.secret
                .createSecret20ViewingKey(
                  contractAddress,
                  "",
                  {},
                  {},
                  (_, viewingKey) => {
                    loadingIndicator.setIsLoading("create-veiwing-key", false);

                    resolve(viewingKey);
                  }
                )
                .then(() => {
                  loadingIndicator.setIsLoading("create-veiwing-key", true);
                });
            });
          }
        };
        const tokenInfo = token.balance.currency;

        const tokenInUsd = convertToUsd(token.balance);
        const tokenString = encodeURIComponent(JSON.stringify(tokenInfo));
        const tokenBalance = {
          balance: token.balance.maxDecimals(6).hideDenom(false).toString(),
          balanceInUsd: tokenInUsd ? tokenInUsd : "",
        };
        const tokenBalanceString = encodeURIComponent(
          JSON.stringify(tokenBalance)
        );
        return (
          <React.Fragment key={token.currency.coinDenom}>
            <Card
              leftImage={
                tokenInfo.coinImageUrl
                  ? tokenInfo.coinImageUrl
                  : tokenInfo.coinDenom[0].toUpperCase()
              }
              heading={
                <ToolTip
                  trigger="hover"
                  tooltip={tokenInfo.coinDenom.toUpperCase()}
                  childrenStyle={{
                    display: "inline-block",
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatTokenName(tokenInfo.coinDenom.toUpperCase())}
                </ToolTip>
              }
              subheading={
                token.isFetching ? (
                  <i className="fas fa-spinner fa-spin ml-1" />
                ) : (
                  token.balance.maxDecimals(6).hideDenom(false).toString()
                )
              }
              subheadingStyle={{ fontSize: "14px" }}
              rightContent={tokenInUsd ? tokenInUsd : ""}
              style={{
                marginBottom: "6px",
                padding: "18px",
              }}
              onClick={() => {
                analyticsStore.logEvent("token_click", {
                  pageName: "Portfolio",
                });
                navigate({
                  pathname: "/asset",
                  search: `?tokenDetails=${tokenString}&balance=${tokenBalanceString}`,
                });
              }}
            />
            {error ? (
              <div style={{ paddingRight: "10px" }}>
                <i
                  className="fas fa-exclamation-circle text-danger"
                  id={validSelector}
                />
                <UncontrolledTooltip target={validSelector}>
                  {error.message}
                </UncontrolledTooltip>
              </div>
            ) : null}
            {error?.data && error.data instanceof WrongViewingKeyError ? (
              <div
                style={{ paddingRight: "10px" }}
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (
                    "type" in token.balance.currency &&
                    token.balance.currency.type === "secret20"
                  ) {
                    const viewingKey = await createViewingKey();
                    if (!viewingKey) {
                      notification.push({
                        placement: "top-center",
                        type: "danger",
                        duration: 2,
                        content: "Failed to create the viewing key",
                        canDelete: true,
                        transition: {
                          duration: 0.25,
                        },
                      });
                      return;
                    }
                    const tokenOf = tokensStore.getTokensOf(current.chainId);
                    await tokenOf.addToken({
                      ...token.balance.currency,
                      viewingKey,
                    });
                    navigate({
                      pathname: "/",
                    });
                  }
                }}
              >
                {accountInfo.isSendingMsg === "createSecret20ViewingKey" ? (
                  <i className="fa fa-spinner fa-spin fa-fw" />
                ) : (
                  <i className="fas fa-wrench" />
                )}
              </div>
            ) : null}
          </React.Fragment>
        );
      })}

      {/* NFT Section for Cardano */}
      {nftTokens.length > 0 && (
        <React.Fragment>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.6)",
              padding: "16px 4px 8px",
            }}
          >
            NFTs
          </div>
          {nftTokens.map((token) => {
            const tokenInfo = token.balance.currency;
            const tokenString = encodeURIComponent(JSON.stringify(tokenInfo));
            const tokenBalance = {
              balance: token.balance.maxDecimals(0).hideDenom(false).toString(),
              balanceInUsd: "",
            };
            const tokenBalanceString = encodeURIComponent(
              JSON.stringify(tokenBalance)
            );
            return (
              <Card
                key={`nft-${token.currency.coinDenom}`}
                leftImage={
                  tokenInfo.coinImageUrl
                    ? tokenInfo.coinImageUrl
                    : tokenInfo.coinDenom[0].toUpperCase()
                }
                heading={
                  <ToolTip
                    trigger="hover"
                    tooltip={tokenInfo.coinDenom}
                    childrenStyle={{
                      display: "inline-block",
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatTokenName(tokenInfo.coinDenom)}
                  </ToolTip>
                }
                subheading={
                  token.isFetching ? (
                    <i className="fas fa-spinner fa-spin ml-1" />
                  ) : (
                    token.balance.maxDecimals(0).hideDenom(false).toString()
                  )
                }
                subheadingStyle={{ fontSize: "14px" }}
                rightContent={"NFT"}
                style={{
                  marginBottom: "6px",
                  padding: "18px",
                }}
                onClick={() => {
                  analyticsStore.logEvent("token_click", {
                    pageName: "Portfolio",
                  });
                  navigate({
                    pathname: "/asset",
                    search: `?tokenDetails=${tokenString}&balance=${tokenBalanceString}`,
                  });
                }}
              />
            );
          })}
        </React.Fragment>
      )}
    </React.Fragment>
  );
});
