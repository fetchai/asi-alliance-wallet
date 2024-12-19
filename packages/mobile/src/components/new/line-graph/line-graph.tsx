import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { Platform, Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { AndroidLineChart } from "./android-chart";
import { IOSLineChart } from "./ios-chart";
import { useStore } from "stores/index";
import { ChartData, TokenStateData } from "@keplr-wallet/stores";
import { formatTimestamp } from "utils/format/date";
import { useNetInfo } from "@react-native-community/netinfo";
import { BlurButton } from "../button/blur-button";

export const LineGraph: FunctionComponent<{
  tokenName: string | undefined;
  duration: string;
  setTokenState: any;
  tokenState?: any;
  height?: number;
  loading: boolean;
  setLoading: any;
}> = ({ tokenName, duration, setTokenState, height, loading, setLoading }) => {
  const style = useStyle();
  const { priceStore, chainStore, tokenGraphStore } = useStore();
  const [chartsData, setChartData] = useState<ChartData[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const netInfo = useNetInfo();
  const networkIsConnected =
    typeof netInfo.isConnected !== "boolean" || netInfo.isConnected;
  let fetValue;
  const cacheKey = useMemo(
    () => `${tokenName}_${duration}_${priceStore.defaultVsCurrency}`,
    [tokenName, duration, priceStore.defaultVsCurrency]
  );

  /// For loading the graph on chain changed and duration
  useEffect(() => {
    setLoading(true);
  }, [cacheKey]);

  function getTimeLabel() {
    switch (duration) {
      default:
      case "1":
        return "TODAY";
      case "7":
        return "1 WEEK";
      case "30":
        return "1 MONTH";
      case "90":
        return "3 MONTH";
      case "365":
        return "1 YEAR";
    }
  }

  const setDefaultPricing = useCallback(() => {
    const chartDataList: ChartData[] = [];
    const timestamp = new Date().getTime();
    const date = formatTimestamp(timestamp, duration);
    const tokenState: TokenStateData = {
      diff: 0,
      time: getTimeLabel(),
      timestamp,
      type: "positive",
    };

    for (let i = 0; i < 5; i++) {
      chartDataList.push({ value: 0, date });
    }

    setChartData(chartDataList);
    setTokenState(tokenState);
  }, []);

  function getChartData() {
    return new Promise(async (resolve, reject) => {
      if (!networkIsConnected) {
        reject("No Internet");
        return;
      }

      try {
        let chartDataList: ChartData[] = [];
        const apiUrl = `https://api.coingecko.com/api/v3/coins/${tokenName}/market_chart`;
        const params = {
          vs_currency: priceStore.defaultVsCurrency,
          days: duration,
        };

        const response = await axios.get(apiUrl, { params });
        chartDataList = response.data.prices.map((price: number[]) => ({
          date: formatTimestamp(price[0], duration),
          value: Number(price[1].toFixed(3)),
        }));

        let tokenState = {};

        if (chartDataList.length > 0) {
          const firstValue = chartDataList[0].value || 0;
          let lastValue = chartDataList[chartDataList.length - 1].value || 0;
          const diff = lastValue - firstValue;
          lastValue = lastValue > 0 ? lastValue : 1;
          const percentageDiff = (diff / lastValue) * 100;
          const type = diff >= 0 ? "positive" : "negative";
          const timestamp = new Date().getTime();

          tokenState = {
            percentageDiff: Math.abs(percentageDiff),
            diff: diff * 100,
            time: getTimeLabel(),
            timestamp,
            type,
          } as TokenStateData;
        }
        resolve({ chartDataList, tokenState });
      } catch (error) {
        reject(error);
      } finally {
        setLoading(false);
      }
    });
  }

  const onRefresh = React.useCallback(() => {
    const durationData = tokenGraphStore.getData;
    const currentTimestamp = new Date().getTime();
    const seconds = Math.round(
      (currentTimestamp -
        (durationData[cacheKey]?.tokenState?.timestamp ?? currentTimestamp)) /
        1000
    );

    if (
      (durationData[cacheKey]?.chartData?.length ?? 0) == 0 ||
      seconds >= 29
    ) {
      getChartData()
        .then((obj: any) => {
          setTokenState(obj.tokenState);

          setChartData(obj.chartDataList);
          durationData[cacheKey] = {
            chartData: [...obj.chartDataList],
            tokenState: obj.tokenState,
          };

          tokenGraphStore.setData(durationData);
        })
        .catch((error) => {
          if ((durationData[cacheKey]?.chartData.length ?? 0) > 0) {
            setTokenState(durationData[cacheKey].tokenState);
            setChartData(durationData[cacheKey].chartData);
          } else {
            setDefaultPricing();
          }
          console.log("Error fetching data:", error, error?.message);
        });
    } else {
      setTokenState(durationData[cacheKey].tokenState);
      setChartData(durationData[cacheKey].chartData);
      setLoading(false);
    }
  }, [cacheKey]);

  if (chartsData.length !== 0) {
    fetValue = Number(chartsData.slice(-1)[0].value);
  } else {
    fetValue = 0;
  }

  /// 30 sec Auto-Refresh graph
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    onRefresh();
    intervalRef.current = setInterval(onRefresh, 30000);

    // Clean up the interval on component unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [cacheKey]);

  return (
    <View
      style={[style.flatten(["margin-top-24", "overflow-hidden"])] as ViewStyle}
    >
      <Text
        style={
          style.flatten([
            "text-caption2",
            "text-center",
            "color-white",
          ]) as ViewStyle
        }
      >
        {`${
          chainStore.current.currencies[0].coinDenom
        }/${priceStore.defaultVsCurrency.toUpperCase()} `}
        <Text style={style.flatten(["color-white@60%"]) as ViewStyle}>
          {`${
            priceStore.supportedVsCurrencies[priceStore.defaultVsCurrency]
              ?.symbol
          }${fetValue.toFixed(2)}`}
        </Text>
      </Text>
      <View
        style={
          style.flatten(
            loading ? ["items-center", "justify-center"] : []
          ) as ViewStyle
        }
      >
        {Platform.OS == "ios" ? (
          <IOSLineChart
            data={chartsData}
            height={height}
            currencySymbol={
              priceStore.supportedVsCurrencies[priceStore.defaultVsCurrency]
                ?.symbol
            }
            loading={loading}
          />
        ) : (
          <AndroidLineChart
            data={chartsData}
            height={height}
            currencySymbol={
              priceStore.supportedVsCurrencies[priceStore.defaultVsCurrency]
                ?.symbol
            }
            loading={loading}
          />
        )}
        {loading && (
          <BlurButton
            text={"Updating the chart"}
            backgroundBlur={false}
            textStyle={style.flatten(["body3"]) as ViewStyle}
            containerStyle={
              style.flatten([
                "padding-x-12",
                "background-color-indigo-800",
                "absolute",
              ]) as ViewStyle
            }
          />
        )}
      </View>
    </View>
  );
};
