import axios from "axios";
import moment from "moment";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import { chartOptions } from "./chart-options";
import style from "./style.module.scss";
import { FiatCurrencies } from "../../config.ui";
import classNames from "classnames";
import { isRunningInSidePanel } from "@utils/side-panel";

interface LineGraphProps {
  duration: number;
  tokenName: string | undefined;
  setTokenState: any;
  loading: boolean;
  setLoading: any;
  vsCurrency: string;
  vsCurrencySymbol: string;
  setTokenCurrentPrice?: any;
}

interface PriceData {
  timestamp: number;
  price: number;
}

function getTimeLabel(duration: number): string {
  if (duration === 1) return "TODAY";
  if (duration === 7) return "1 WEEK";
  if (duration === 30) return "1 MONTH";
  if (duration === 90) return "3 MONTH";
  if (duration === 365) return "1 YEAR";
  if (duration === 100000) return "ALL";
  return "";
}

export const LineGraph: React.FC<LineGraphProps> = ({
  duration,
  tokenName,
  setTokenState,
  loading,
  setLoading,
  vsCurrency,
  vsCurrencySymbol,
  setTokenCurrentPrice,
}) => {
  const [prices, setPrices] = useState<PriceData[]>([]);
  const cacheKey = useMemo(
    () => `${tokenName}_${duration}_${vsCurrency}`,
    [tokenName, duration, vsCurrency]
  );

  const cachedPrices = useMemo(() => {
    if (!tokenName) {
      return null;
    }
    const cachedData = localStorage.getItem(cacheKey);
    return cachedData ? JSON.parse(cachedData) : null;
  }, [cacheKey, tokenName]);

  const isCachedPricesValid = (updatedAt: any) => {
    const currTime = Date.parse(new Date().toString());
    const prevUpdatedAt = Date.parse(updatedAt.toString());

    return currTime - prevUpdatedAt < 10 * 60 * 1000;
  };

  const applyTokenState = useCallback(
    (newPrices: PriceData[]) => {
      if (newPrices.length === 0) {
        setTokenState({
          percentageDiff: 0,
          diff: 0,
          time: getTimeLabel(duration),
          type: "positive",
        });
        return;
      }

      const firstValue = newPrices[0].price || 0;
      const lastValue = newPrices[newPrices.length - 1].price || 0;
      const diff = lastValue - firstValue;
      const denominator = lastValue > 0 ? lastValue : 1;
      const percentageDiff = (diff / denominator) * 100;

      setTokenState({
        percentageDiff: Math.abs(percentageDiff),
        diff: diff * 100,
        time: getTimeLabel(duration),
        type: diff >= 0 ? "positive" : "negative",
      });
    },
    [duration, setTokenState]
  );

  const setDefaultPricing = useCallback(() => {
    const timestamp = Date.now();
    const newPrices: PriceData[] = Array.from({ length: 5 }, () => ({
      timestamp,
      price: 0,
    }));
    setPrices(newPrices);
    applyTokenState(newPrices);
  }, [applyTokenState]);

  useEffect(() => {
    let cancelled = false;

    const fetchPrices = async () => {
      setLoading(true);
      let keepLoadingForRetry = false;

      if (!tokenName) {
        setDefaultPricing();
        setLoading(false);
        return;
      }

      try {
        let newPrices: PriceData[] = [];
        if (
          cachedPrices &&
          !!cachedPrices.updatedAt &&
          isCachedPricesValid(cachedPrices.updatedAt)
        ) {
          newPrices = cachedPrices.newPrices;
        } else {
          const apiUrl = `https://api.coingecko.com/api/v3/coins/${tokenName}/market_chart`;
          const params = { vs_currency: vsCurrency, days: duration };

          const response = await axios.get(apiUrl, { params });
          newPrices = response.data.prices.map((price: number[]) => ({
            timestamp: price[0],
            price: price[1],
          }));

          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              newPrices,
              updatedAt: new Date(),
            })
          );
        }

        if (cancelled) {
          return;
        }

        applyTokenState(newPrices);
        setPrices(newPrices);
      } catch (err: any) {
        if (cancelled) {
          return;
        }

        const status = err?.response?.status;
        if (status === 429) {
          if (cachedPrices?.newPrices) {
            setPrices(cachedPrices.newPrices);
            applyTokenState(cachedPrices.newPrices);
          } else {
            keepLoadingForRetry = true;
            setTimeout(() => {
              if (!cancelled) {
                fetchPrices();
              }
            }, 10 * 1000);
          }
        } else if (cachedPrices?.newPrices?.length) {
          setPrices(cachedPrices.newPrices);
          applyTokenState(cachedPrices.newPrices);
        } else {
          setDefaultPricing();
        }
      } finally {
        if (!cancelled && !keepLoadingForRetry) {
          setLoading(false);
        }
      }
    };

    fetchPrices();

    return () => {
      cancelled = true;
    };
  }, [
    duration,
    tokenName,
    vsCurrency,
    cacheKey,
    cachedPrices,
    setTokenState,
    setLoading,
    applyTokenState,
    setDefaultPricing,
  ]);

  const chartData = {
    labels: prices.map((priceData: any) => {
      let format = "MMM DD, YYYY";
      if (duration === 1) format = "MMM DD, HH:mm";
      else if (duration === 7) format = "MMM DD, HH:mm";
      else if (duration === 30) format = "MMM DD";
      else if (duration === 90) format = "MMM DD YYYY";
      else if (duration === 365) format = "MMM DD, YYYY";
      const time = moment(priceData.timestamp).format(format);
      return time;
    }),
    datasets: [
      {
        label: vsCurrencySymbol,
        backgroundColor: "#A1A3A3",
        data: prices.map((priceData: any) =>
          priceData.price.toFixed(3).toString()
        ),
        fill: false,
        vsCurrency,
        borderColor: "black",
        tension: 0.1,
        pointRadius: 0,
        pointHoverBackgroundColor: "#73A271",
        pointHoverRadius: 6,
        pointHoverBorderColor: "transparent",
      },
    ],
  };
  if (setTokenCurrentPrice) {
    if (chartData.datasets[0].data.length !== 0) {
      setTokenCurrentPrice(Number(chartData.datasets[0].data.slice(-1)[0]));
    } else {
      setTokenCurrentPrice(0);
    }
  }

  return (
    <div
      className={classNames(
        style["line-graph"],
        isRunningInSidePanel() && style["line-graph-sidepanel"]
      )}
    >
      {loading ? (
        <div>
          <div className={style["loadingText"]}>Updating the chart</div>
        </div>
      ) : (
        <Line
          data={chartData}
          options={{
            ...chartOptions,
            scales: {
              xAxes: chartOptions.scales?.xAxes,
              yAxes: [
                {
                  display: true,
                  gridLines: { display: false },
                  ticks: {
                    display: true,
                    callback: function (value: any, index: any, values: any) {
                      if (index === 0 || index === values.length - 1) {
                        const maxDecimals = Math.max(
                          ...values?.map((v: number) => {
                            const parts = v?.toString().split(".");
                            return parts?.[1] ? parts[1].length : 0;
                          })
                        );

                        let formattedValue: string;

                        if (Number.isInteger(value)) {
                          formattedValue = value.toString();
                        } else {
                          formattedValue = value.toFixed(maxDecimals);
                        }

                        if (index === values.length - 1) {
                          const lowerValue = values[0];
                          const lowerFormatted = Number.isInteger(lowerValue)
                            ? lowerValue.toString()
                            : lowerValue.toFixed(maxDecimals);
                          if (
                            formattedValue === lowerFormatted ||
                            formattedValue === "0"
                          ) {
                            return "";
                          }
                        }

                        const currencySymbol = FiatCurrencies.find(
                          (item) =>
                            item.currency === chartData.datasets[0].vsCurrency
                        )?.symbol;

                        return `${currencySymbol}${formattedValue}`;
                      }
                      return "";
                    },
                  },
                },
              ],
            },
          }}
        />
      )}
    </div>
  );
};
