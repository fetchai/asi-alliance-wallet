import React from "react";
import style from "./style.module.scss";
import { useStore } from "../../../stores";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { useLanguage } from "../../../languages";
import { AppCurrency } from "@keplr-wallet/types";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router";
import { separateNumericAndDenom } from "@utils/format";
import { Skeleton } from "@components-v2/skeleton-loader";
import { WalletStatus } from "@keplr-wallet/stores";
import { useQuery } from "@tanstack/react-query";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { useMoonpayCurrency } from "@utils/moonpay-currency";
import { moonpaySupportedTokensByChainId } from "../../more/token/moonpay/utils";

interface Props {
  tokenState: any;
}

export const Balances: React.FC<Props> = observer(({ tokenState }) => {
  const {
    chainStore,
    accountStore,
    queriesStore,
    priceStore,
    keyRingStore,
    activityStore,
    analyticsStore,
  } = useStore();
  const navigate = useNavigate();
  const language = useLanguage();

  const fiatCurrency = language.fiatCurrency;

  const current = chainStore.current;

  const queries = queriesStore.get(current.chainId);

  const accountInfo = accountStore.getAccount(current.chainId);

  const balanceQuery = queries.queryBalances.getQueryBech32Address(
    accountInfo.bech32Address
  );
  const balanceStakableQuery = balanceQuery.stakable;

  const isNoble =
    ChainIdHelper.parse(chainStore.current.chainId).identifier === "noble";
  const hasUSDC = chainStore.current.currencies.find(
    (currency: AppCurrency) => currency.coinMinimalDenom === "uusdc"
  );

  const isEvm = chainStore.current.features?.includes("evm") ?? false;
  const stakable = (() => {
    if (isNoble && hasUSDC) {
      return balanceQuery.getBalanceFromCurrency(hasUSDC);
    }

    return balanceStakableQuery.balance;
  })();

  const delegated = queries.cosmos.queryDelegations
    .getQueryBech32Address(accountInfo.bech32Address)
    .total.upperCase(true);

  const unbonding = queries.cosmos.queryUnbondingDelegations
    .getQueryBech32Address(accountInfo.bech32Address)
    .total.upperCase(true);

  const accountOrChainChanged =
    activityStore.getAddress !== accountInfo.bech32Address ||
    activityStore.getChainId !== current.chainId;

  const isNetworkSepolia = chainStore.current.chainId === "11155111";
  const { data } = useMoonpayCurrency(isNetworkSepolia);

  const rewards = useQuery({
    queryKey: ["rewards", accountInfo.bech32Address, current.chainId],
    queryFn: async () => {
      if (accountInfo.bech32Address && current.chainId) {
        const rewards = queries.cosmos.queryRewards.getQueryBech32Address(
          accountInfo.bech32Address
        );
        await rewards.waitFreshResponse();
        const stakableRewards = rewards.stakableReward;
        return stakableRewards;
      }
      return null;
    },
    refetchInterval: 3600 * 1000,
    refetchOnMount: false,
    staleTime: accountOrChainChanged ? 0 : 3600 * 1000,
  });

  const allowedTokenList = data?.filter(
    (item: any) =>
      item?.type === "crypto" && (item?.isSellSupported || !item.isSuspended)
  );

  const moonpaySupportedTokens = moonpaySupportedTokensByChainId(
    current.chainId,
    allowedTokenList,
    chainStore.chainInfos
  );

  const currency = current.feeCurrencies?.[0];
  const stakableReward = rewards?.data || new CoinPretty(currency, new Int(0));
  const stakedSum = delegated.add(unbonding);
  const total = stakable.add(stakedSum).add(stakableReward);

  const totalPrice = priceStore.calculatePrice(total, fiatCurrency);

  const { numericPart: totalNumber, denomPart: totalDenom } =
    separateNumericAndDenom(
      total.shrink(true).trim(true).maxDecimals(6).toString()
    );

  const changeInDollarsValue =
    tokenState.type === "positive"
      ? tokenState.diff / 100
      : -tokenState.diff / 100;

  const changeInDollarsClass =
    tokenState.type === "positive"
      ? style["increaseInDollarsGreen"]
      : style["increaseInDollarsOrange"];

  return (
    <div className={style["balance-card"]}>
      {isEvm ? (
        <div className={style["balance-field"]}>
          <div className={style["balance"]}>
            {Number(totalNumber).toLocaleString("en-US")}{" "}
            <div className={style["denom"]}>{totalDenom}</div>
          </div>
          <div className={style["inUsd"]}>
            {totalPrice && ` ${totalPrice.toString()} `}
          </div>
          {tokenState?.diff && (
            <div
              className={` ${
                tokenState.type === "positive"
                  ? style["priceChangesGreen"]
                  : style["priceChangesOrange"]
              }`}
            >
              <div
                className={
                  style["changeInDollars"] + " " + changeInDollarsClass
                }
              >
                {priceStore.getFiatCurrency(fiatCurrency)?.symbolName}{" "}
                {changeInDollarsValue.toFixed(4)} {totalDenom}
              </div>
              <div className={style["changeInPer"]}>
                ( {tokenState.type === "positive" ? "+" : "-"}
                {parseFloat(tokenState.percentageDiff).toFixed(1)} %)
              </div>
              <div className={style["day"]}>{tokenState.time}</div>
            </div>
          )}
        </div>
      ) : (
        <div className={style["balance-field"]}>
          <div className={style["balance"]}>
            {accountInfo.walletStatus === WalletStatus.Loading ||
            keyRingStore.status === 0 ||
            rewards.isFetching ? (
              <Skeleton height="37.5px" />
            ) : (
              <React.Fragment>
                {Number(totalNumber).toLocaleString("en-US")}{" "}
                <div className={style["denom"]}>{totalDenom}</div>
              </React.Fragment>
            )}
          </div>
          <div className={style["inUsd"]}>
            {accountInfo.walletStatus === WalletStatus.Loading ||
            keyRingStore.status === 0 ||
            rewards.isFetching ? (
              <Skeleton height="21px" />
            ) : totalPrice ? (
              ` ${totalPrice.toString()} ${fiatCurrency.toUpperCase()}`
            ) : (
              ` ${total
                .shrink(true)
                .trim(true)
                .hideDenom(true)
                .maxDecimals(6)
                .toString()} ${fiatCurrency.toUpperCase()}`
            )}
          </div>
          {tokenState?.diff && (
            <div
              className={` ${
                tokenState.type === "positive"
                  ? style["priceChangesGreen"]
                  : style["priceChangesOrange"]
              }`}
            >
              <div
                className={
                  style["changeInDollars"] + " " + changeInDollarsClass
                }
              >
                {priceStore.getFiatCurrency(fiatCurrency)?.symbolName}{" "}
                {changeInDollarsValue.toFixed(4)}
              </div>
              <div className={style["changeInPer"]}>
                ({tokenState.type === "positive" ? "+" : "-"}
                {parseFloat(tokenState.percentageDiff).toFixed(1)} %)
              </div>
              <div className={style["day"]}>{tokenState.time}</div>
            </div>
          )}
        </div>
      )}
      <div className={style["btnContainer"]}>
        {moonpaySupportedTokens?.length > 0 && isNetworkSepolia ? (
          <button
            className={`${style["portfolio"]} ${style["buy"]}`}
            onClick={() => {
              navigate("/more/token/moonpay");
            }}
          >
            Buy/Sell
          </button>
        ) : (
          ""
        )}
        <button
          className={style["portfolio"]}
          onClick={() => {
            analyticsStore.logEvent("view_portfolio_click", {
              pageName: "Home",
            });
            navigate("/portfolio");
          }}
        >
          View portfolio
        </button>
      </div>
    </div>
  );
});
