import { HeaderLayout } from "@layouts-v2/header-layout";
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import style from "./style.module.scss";
import { LineGraphView } from "@components-v2/line-graph";
import { getTokenIcon } from "@utils/get-token-icon";
import { Activity } from "./activity";
import { observer } from "mobx-react-lite";
import {
  convertEpochToDate,
  getEnumKeyByEnumValue,
  isVestingExpired,
  removeTrailingZeros,
  separateNumericAndDenom,
} from "@utils/format";
import { useStore } from "../../stores";
import { TXNTYPE } from "../../config";
import { useLanguage } from "../../languages";
import { Alert } from "reactstrap";
import { VestingType } from "@keplr-wallet/stores";
import { clearDecimals } from "../sign/decimals";
import { Link } from "react-router-dom";
import { FormattedMessage } from "react-intl";
import {
  useMoonpayCurrency,
  checkAddressIsBuySellWhitelisted,
} from "@utils/moonpay-currency";
import { moonpaySupportedTokensByChainId } from "../more/token/moonpay/utils";

export const AssetView = observer(() => {
  const {
    activityStore,
    accountStore,
    queriesStore,
    chainStore,
    analyticsStore,
    priceStore,
  } = useStore();
  const location = useLocation();
  const [tokenInfo, setTokenInfo] = useState<any>();
  const [tokenIcon, setTokenIcon] = useState<string>("");
  const [showCalendar, setShowCalendar] = useState<boolean>(false);

  const [balances, setBalances] = useState<any>();
  const [assetValues, setAssetValues] = useState<any>();
  const [tokenCurrentPrice, setTokenCurrentPrice] = useState<number>(0);
  const navigate = useNavigate();
  const language = useLanguage();
  const fiatCurrency = language.fiatCurrency;

  const current = chainStore.current;
  const queries = queriesStore.get(current.chainId);
  const accountInfo = accountStore.getAccount(current.chainId);
  const { data } = useMoonpayCurrency();

  const allowedTokenList = data?.filter(
    (item: any) =>
      item?.type === "crypto" && (item?.isSellSupported || !item.isSuspended)
  );

  const moonpaySupportedTokens = moonpaySupportedTokensByChainId(
    current.chainId,
    allowedTokenList,
    chainStore.chainInfos
  );

  const isVesting = queries.cosmos.queryAccount.getQueryBech32Address(
    accountInfo.bech32Address
  ).isVestingAccount;

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tokenInfoString = searchParams.get("tokenDetails");
    const balancesString = searchParams.get("balance");
    if (balancesString) {
      const decodedBalancesString = JSON.parse(
        decodeURIComponent(balancesString)
      );
      const balances: any = decodedBalancesString;
      setBalances(balances);
    }

    if (tokenInfoString) {
      const decodedTokenInfo = JSON.parse(decodeURIComponent(tokenInfoString));
      const tokenInfo: any = decodedTokenInfo;
      setTokenInfo(tokenInfo);
    }
  }, [location.search]);
  useEffect(() => {
    const fetchTokenImage = async () => {
      if (!!tokenIcon || !tokenInfo) return;

      const tokenImage = await getTokenIcon(tokenInfo?.coinGeckoId);
      setTokenIcon(tokenImage);
    };
    fetchTokenImage();
  }, [tokenInfo?.coinGeckoId]);
  const { numericPart: totalNumber, denomPart: totalDenom } =
    separateNumericAndDenom(balances?.balance.toString());

  let changeInDollarsClass = null;
  if (assetValues) {
    changeInDollarsClass =
      assetValues?.type === "positive"
        ? style["increaseInDollarsGreen"]
        : style["increaseInDollarsOrange"];
  }

  let changeInDollarsValue = null;
  if (assetValues) {
    changeInDollarsValue =
      assetValues?.type === "positive"
        ? assetValues.diff / 100
        : -assetValues.diff / 100;
  }

  const vestingInfo = queries.cosmos.queryAccount.getQueryBech32Address(
    accountInfo.bech32Address
  ).vestingAccount;
  const latestBlockTime = queries.cosmos.queryRPCStatus.latestBlockTime;

  const vestingEndTimeStamp = Number(
    vestingInfo.base_vesting_account?.end_time
  );
  const vestingStartTimeStamp = Number(vestingInfo.start_time);

  const spendableBalances =
    queries.cosmos.querySpendableBalances.getQueryBech32Address(
      accountInfo.bech32Address
    );

  const { numericPart: spendableNumber, denomPart: _spendableDenom } =
    separateNumericAndDenom(
      spendableBalances.balances.toString().length > 0
        ? spendableBalances.balances.toString()
        : "0"
    );

  function getVestingBalance(balance: number) {
    return clearDecimals((balance / 10 ** 18).toFixed(20).toString());
  }

  const getOriginalVestingBalance = () =>
    vestingInfo.base_vesting_account
      ? getVestingBalance(
          Number(vestingInfo.base_vesting_account?.original_vesting[0].amount)
        )
      : "0";

  const getVestedBalance = () =>
    getVestingBalance(
      Number(getOriginalVestingBalance()) - Number(vestingBalance())
    ).toString();
  const vestingBalance = () => {
    if (vestingInfo["@type"] == VestingType.Continuous.toString()) {
      if (totalNumber > clearDecimals(spendableNumber)) {
        return getVestingBalance(
          Number(totalNumber) - Number(clearDecimals(spendableNumber))
        ).toString();
      } else if (
        latestBlockTime &&
        vestingEndTimeStamp > latestBlockTime &&
        clearDecimals(spendableNumber) === totalNumber
      ) {
        const ov = Number(
          vestingInfo.base_vesting_account?.original_vesting[0].amount
        );
        const vested =
          ov *
          ((latestBlockTime - vestingStartTimeStamp) /
            (vestingEndTimeStamp - vestingStartTimeStamp));
        return getVestingBalance(ov - vested);
      }

      return "0";
    }
    return getOriginalVestingBalance();
  };

  const isSendDisabled = activityStore.getPendingTxnTypes[TXNTYPE.send];

  // check if address is whitelisted for Buy/Sell feature
  const isAddressWhitelisted = accountInfo?.bech32Address
    ? checkAddressIsBuySellWhitelisted(
        chainStore.current.chainId === "1" ||
          chainStore.current.chainId === "injective-1"
          ? accountInfo.ethereumHexAddress || ""
          : accountInfo.bech32Address
      )
    : false;

  return (
    <HeaderLayout showTopMenu={true} onBackButton={() => navigate(-1)}>
      <div className={style["asset-info"]}>
        {tokenIcon ? (
          <img className={style["icon"]} src={tokenIcon} alt="" />
        ) : (
          <div className={style["icon"]}>
            {tokenInfo?.coinDenom[0].toUpperCase()}
          </div>
        )}
        <div className={style["name"]}>{tokenInfo?.coinDenom}</div>
        <div className={style["price-in-usd"]}>
          {`${tokenCurrentPrice} ${fiatCurrency.toUpperCase()}`}
        </div>

        {assetValues?.diff && (
          <div
            className={` ${
              assetValues.type === "positive"
                ? style["priceChangesGreen"]
                : style["priceChangesOrange"]
            }`}
          >
            <div
              className={style["changeInDollars"] + " " + changeInDollarsClass}
            >
              {priceStore.getFiatCurrency(fiatCurrency)?.symbolName}{" "}
              {changeInDollarsValue !== null && changeInDollarsValue.toFixed(4)}
            </div>
            <div className={style["changeInPer"]}>
              ( {assetValues.type === "positive" ? "+" : "-"}
              {parseFloat(assetValues.percentageDiff).toFixed(1)} %)
            </div>
            <div className={style["day"]}>{assetValues.time}</div>
          </div>
        )}
      </div>
      {tokenInfo?.coinGeckoId && (
        <LineGraphView
          tokenName={tokenInfo?.coinGeckoId}
          setTokenState={setAssetValues}
          tokenState={assetValues}
          setTokenCurrentPrice={setTokenCurrentPrice}
        />
      )}
      <div className={style["balances"]}>
        <div className={style["your-bal"]}>YOUR BALANCE</div>
        <div>
          <div className={style["balance-field"]}>
            <div className={style["balance"]}>
              {Number(totalNumber).toLocaleString("en-US")}{" "}
              <div className={style["denom"]}>{totalDenom}</div>
            </div>
            <div className={style["inUsd"]}>
              {balances?.balanceInUsd
                ? `${balances?.balanceInUsd} ${fiatCurrency.toUpperCase()}`
                : `0 ${fiatCurrency.toUpperCase()}`}{" "}
            </div>
          </div>
        </div>
        <div />
      </div>
      {isVesting && !isVestingExpired(vestingEndTimeStamp) && (
        <Alert className={style["alert"]}>
          <div className={style["topContent"]}>
            <img src={require("@assets/svg/wireframe/lock.svg")} alt="" />
            <div>
              <p className={style["lightText"]}>
                <FormattedMessage
                  id="portfolio.detail.vesting-card.paragraph"
                  values={{
                    vestingBalance: removeTrailingZeros(vestingBalance()),
                    balanceDenom: totalDenom,
                  }}
                />
              </p>
              <div className={style["link-row"]}>
                <div
                  onClick={() => setShowCalendar((prev) => !prev)}
                  style={{
                    cursor: "pointer",
                  }}
                >
                  <span>
                    <FormattedMessage
                      id="portfolio.detail.vesting-card.calendar.show/hide.calendar"
                      values={{
                        calendarType: showCalendar ? "Hide" : "View",
                      }}
                    />
                  </span>
                  {showCalendar ? (
                    <img
                      src={require("@assets/svg/chevron-up.svg")}
                      alt="up icon"
                    />
                  ) : (
                    <img
                      src={require("@assets/svg/wireframe/chevron-down-rewards.svg")}
                      alt="down icon"
                    />
                  )}
                </div>
                <Link
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  to={
                    "https://docs.cosmos.network/v0.45/modules/auth/05_vesting.html"
                  }
                  target="_blank"
                >
                  <div
                    style={{
                      cursor: "pointer",
                    }}
                  >
                    <span>
                      <FormattedMessage id="portfolio.detail.vesting-card.calendar.learn.more" />
                    </span>
                    <img
                      src={require("@assets/svg/wireframe/external-link-vesting.svg")}
                      alt="edit icon"
                    />
                  </div>
                </Link>
              </div>
            </div>
          </div>
          {showCalendar && (
            <div className={style["calendar-container"]}>
              <div className={style["row"]}>
                <div className={style["box-1"]}>
                  <div
                    className={style["show-calendar-text"]}
                    style={{
                      color: "rgba(255,255,255,0.6)",
                      marginBottom: "6px",
                    }}
                  >
                    <FormattedMessage id="portfolio.detail.vesting-card.calendar.vesting.type" />
                  </div>
                </div>
                <div className={style["box-2"]}>
                  <div className={style["show-calendar-text"]}>
                    {`${getEnumKeyByEnumValue(
                      vestingInfo["@type"] ?? VestingType.Continuous.toString(),
                      VestingType
                    )} Vesting`}
                  </div>
                </div>
              </div>
              {vestingInfo["@type"] == VestingType.Continuous.toString() && (
                <div className={style["row"]}>
                  <div className={style["box-1"]}>
                    <div
                      className={style["show-calendar-text"]}
                      style={{
                        color: "rgba(255,255,255,0.6)",
                        marginBottom: "6px",
                      }}
                    >
                      <FormattedMessage id="portfolio.detail.vesting-card.calendar.start.time" />
                    </div>
                  </div>
                  <div className={style["box-2"]}>
                    <div className={style["show-calendar-text"]}>
                      {convertEpochToDate(vestingStartTimeStamp)}
                    </div>
                  </div>
                </div>
              )}
              <div className={style["row"]}>
                <div className={style["box-1"]}>
                  <div
                    className={style["show-calendar-text"]}
                    style={{
                      color: "rgba(255,255,255,0.6)",
                      marginBottom: "6px",
                    }}
                  >
                    <FormattedMessage id="portfolio.detail.vesting-card.calendar.end.time" />
                  </div>
                </div>
                <div className={style["box-2"]}>
                  <div className={style["show-calendar-text"]}>
                    {convertEpochToDate(vestingEndTimeStamp)}
                  </div>
                </div>
              </div>
              <div
                className={style["row"]}
                style={
                  !(vestingInfo["@type"] == VestingType.Continuous.toString())
                    ? { marginBottom: "0px" }
                    : {}
                }
              >
                <div className={style["box-1"]}>
                  <div
                    className={style["show-calendar-text"]}
                    style={{
                      color: "rgba(255,255,255,0.6)",
                      marginBottom: "6px",
                    }}
                  >
                    <FormattedMessage id="portfolio.detail.vesting-card.calendar.originally.locked" />
                  </div>
                </div>
                <div className={style["box-2"]}>
                  <span className={style["show-calendar-text"]}>
                    {getOriginalVestingBalance()}
                  </span>
                  <span
                    className={style["show-calendar-text"]}
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    {totalDenom}
                  </span>
                </div>
              </div>
              {vestingInfo["@type"] == VestingType.Continuous.toString() && (
                <React.Fragment>
                  <div className={style["row"]}>
                    <div className={style["box-1"]}>
                      <div
                        className={style["show-calendar-text"]}
                        style={{
                          color: "rgba(255,255,255,0.6)",
                          marginBottom: "6px",
                        }}
                      >
                        <FormattedMessage id="portfolio.detail.vesting-card.calendar.currently.locked" />
                      </div>
                    </div>
                    <div className={style["box-2"]}>
                      <span className={style["show-calendar-text"]}>
                        {vestingBalance().toString()}
                      </span>
                      <span
                        className={style["show-calendar-text"]}
                        style={{ color: "rgba(255,255,255,0.6)" }}
                      >
                        {totalDenom}
                      </span>
                    </div>
                  </div>
                  <div className={style["row"]} style={{ marginBottom: "0px" }}>
                    <div className={style["box-1"]}>
                      <div
                        className={style["show-calendar-text"]}
                        style={{
                          color: "rgba(255,255,255,0.6)",
                          marginBottom: "6px",
                        }}
                      >
                        <FormattedMessage id="portfolio.detail.vesting-card.calendar.already.unlocked" />
                      </div>
                    </div>
                    <div className={style["box-2"]}>
                      <span className={style["show-calendar-text"]}>
                        {getVestedBalance()}
                      </span>
                      <span
                        className={style["show-calendar-text"]}
                        style={{ color: "rgba(255,255,255,0.6)" }}
                      >
                        {totalDenom}
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              )}
            </div>
          )}
        </Alert>
      )}
      <div className={style["tokenActionContainer"]}>
        <div
          className={style["tokenAction"]}
          onClick={
            !isSendDisabled
              ? () => {
                  navigate("/send");
                  analyticsStore.logEvent("send_click", {
                    pageName: "Token Detail",
                  });
                }
              : undefined
          }
        >
          <div className={style["tokenActionLogo"]}>
            {isSendDisabled ? (
              <i className="fas fa-spinner fa-spin ml-2 mr-2" />
            ) : (
              <img
                src={require("@assets/svg/wireframe/arrow-up-gradient.svg")}
                alt=""
              />
            )}
          </div>
          <p className={style["tokenActionTitle"]}>Send</p>
        </div>
        <div
          className={style["tokenAction"]}
          onClick={() => {
            navigate("/receive");
            analyticsStore.logEvent("receive_click", {
              pageName: "Token Detail",
            });
          }}
        >
          <div className={style["tokenActionLogo"]}>
            <img
              src={require("@assets/svg/wireframe/arrow-down-gradient.svg")}
              alt=""
            />
          </div>
          <p className={style["tokenActionTitle"]}>Receive</p>
        </div>
        {moonpaySupportedTokens?.length > 0 &&
        !current.beta &&
        isAddressWhitelisted ? (
          <div
            className={style["tokenAction"]}
            onClick={() => navigate("/more/token/moonpay")}
          >
            <div className={style["tokenActionLogo"]}>
              <img
                src={require("@assets/svg/wireframe/plus-minus-gradient.svg")}
                alt=""
              />
            </div>
            <p className={style["tokenActionTitle"]}>Buy / Sell</p>
          </div>
        ) : (
          ""
        )}
        {tokenInfo?.coinDenom === "FET" && (
          <div
            className={style["tokenAction"]}
            onClick={() => {
              navigate("/validator/validator-list");
              analyticsStore.logEvent("stake_click", {
                chainId: chainStore.current.chainId,
                chainName: chainStore.current.chainName,
                pageName: "Token Detail",
              });
            }}
          >
            <div className={style["tokenActionLogo"]}>
              <img src={require("@assets/svg/wireframe/earn.svg")} alt="" />
            </div>
            <p className={style["tokenActionTitle"]}>Stake</p>
          </div>
        )}
      </div>
      <Activity token={tokenInfo?.coinDenom} />
    </HeaderLayout>
  );
});
