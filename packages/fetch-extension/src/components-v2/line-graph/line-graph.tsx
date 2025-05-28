import axios from "axios";
import moment from "moment";
import React, { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import { chartOptions } from "./chart-options";
import style from "./style.module.scss";

interface LineGraphProps {
  duration: number;
  tokenName: string | undefined;
  setTokenState: any;
  loading: boolean;
  setLoading: any;
  vsCurrency: string;
  setTokenCurrentPrice?: any;
}

interface PriceData {
  timestamp: number;
  price: number;
}

export const LineGraph: React.FC<LineGraphProps> = ({
  duration,
  tokenName,
  setTokenState,
  loading,
  setLoading,
  vsCurrency,
  setTokenCurrentPrice,
}) => {
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cacheKey = useMemo(
    () => `${tokenName}_${duration}_${vsCurrency}`,
    [tokenName, duration, vsCurrency]
  );

  const cachedPrices = useMemo(() => {
    const cachedData = localStorage.getItem(cacheKey);
    return cachedData ? JSON.parse(cachedData) : null;
  }, [cacheKey]);

  const isCachedPricesValid = (updatedAt: any) => {
    const currTime = Date.parse(new Date().toString());
    const prevUpdatedAt = Date.parse(updatedAt.toString());

    return currTime - prevUpdatedAt < 10 * 60 * 1000;
  };

  useEffect(() => {
    const fetchPrices = async () => {
      setLoading(true);
      setError("");
      try {
        let newPrices: any[] = [];
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

          const lastUpdatedPrice = {
            newPrices,
            updatedAt: new Date(),
          };

          localStorage.setItem(cacheKey, JSON.stringify(lastUpdatedPrice));
        }
        if (newPrices.length > 0) {
          const firstValue = newPrices[0].price || 0;
          const lastValue = newPrices[newPrices.length - 1].price || 0;
          const diff = lastValue - firstValue;
          const percentageDiff = (diff / lastValue) * 100;
          let time = "";
          if (duration === 1) time = "TODAY";
          else if (duration === 7) time = "1 WEEK";
          else if (duration === 30) time = "1 MONTH";
          else if (duration === 90) time = "3 MONTH";
          else if (duration === 365) time = "1 YEAR";
          else if (duration === 100000) time = "ALL";

          const type = diff >= 0 ? "positive" : "negative";

          setTokenState({
            percentageDiff: Math.abs(percentageDiff),
            diff: diff * 100,
            time,
            type,
          });
        }
        setPrices(newPrices);
        setLoading(false);
      } catch (error) {
        if (error.response.status === 429) {
          setTimeout(() => {
            fetchPrices();
          }, 10 * 1000);
          console.log("Too many request error, trying to fetch again");
          if (cachedPrices) setPrices(cachedPrices.newPrices);
          return;
        }

        console.log("Error fetching data:", { error });
        setError("Unable to fetch data. Please try again.");
      }
    };

    fetchPrices();
  }, [duration, tokenName, vsCurrency, cacheKey, cachedPrices, setTokenState]);

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
        label: "",
        backgroundColor: "transparent",
        data: prices.map((priceData: any) =>
          priceData.price.toFixed(3).toString()
        ),
        fill: false,
        vsCurrency,
        borderColor: "black",
        tension: 0.1,
        pointRadius: 0,
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
    <div className={style["line-graph"]}>
      {loading ? (
        <div>
          {error ? (
            <div>{error}</div>
          ) : (
            <div>
              <div className={style["loadingText"]}>Updating the chart</div>
            </div>
          )}
        </div>
      ) : (
        <Line data={chartData} options={chartOptions} />
      )}
    </div>
  );
};
