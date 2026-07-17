import React, { FunctionComponent } from "react";
import { Text, View, ViewStyle } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { useStyle } from "styles/index";

export const IOSLineChart: FunctionComponent<{
  data: any;
  height?: number;
  currencySymbol: string | undefined;
  loading: boolean;
}> = ({ data, height, currencySymbol, loading }) => {
  const style = useStyle();

  const maxValue = Number(
    Math.max(...data.map((v: { value: any }) => v.value))
  );

  const minValue = Number(
    Math.min(...data.map((v: { value: any }) => v.value))
  );

  const chartMaxValue = Number(maxValue - minValue);

  const getSignificantDecimals = (v: number): number => {
    if (v === 0) return 2;
    const abs = Math.abs(v);
    if (abs >= 1) return 2;
    const decPart = abs.toFixed(10).split(".")[1] ?? "";
    let firstNonZero = 0;
    for (let i = 0; i < decPart.length; i++) {
      if (decPart[i] !== "0") {
        firstNonZero = i;
        break;
      }
    }
    return firstNonZero + 2;
  };

  const maxDecimals = Math.max(
    getSignificantDecimals(minValue),
    getSignificantDecimals(maxValue)
  );

  const formatYLabel = (label: string) => {
    const val = parseFloat(label);
    if (isNaN(val)) return "";
    const formatted = Number.isInteger(val)
      ? val.toString()
      : val.toFixed(maxDecimals);
    return `${currencySymbol}${formatted}`;
  };

  return (
    <LineChart
      // chart variable
      areaChart={false}
      height={height}
      data={data}
      curved={true}
      //   animation variable

      isAnimated={false}
      // animationDuration={1200}
      // animateOnDataChange={true}
      // onDataChangeAnimationDuration={300}

      // data points variable
      hideDataPoints={true}
      adjustToWidth={true}
      thickness={2}
      initialSpacing={8}
      endSpacing={8}
      // y label variable
      showFractionalValues={true}
      maxValue={chartMaxValue}
      yAxisOffset={minValue}
      noOfSections={1}
      // y axis variable
      disableScroll={true}
      yAxisThickness={0}
      yAxisColor={"transparent"}
      hideYAxisText={false}
      yAxisTextStyle={{ color: "#9A9AA2", fontSize: 10 }}
      yAxisLabelWidth={58}
      formatYLabel={formatYLabel}
      // x axis variable
      xAxisThickness={0}
      // horizontal line variable
      hideRules={true}
      // line variable
      lineGradient={false}
      color={loading ? "#DCDCE3" : "#151a1a"}
      pointerConfig={{
        pointerStripUptoDataPoint: true,
        pointerStripColor: "#9A9AA2",
        strokeDashArray: [8, 8],
        pointerColor: "#73A271",
        pointerLabelHeight: 50,
        activatePointersOnLongPress: true,
        autoAdjustPointerLabelPosition: true,
        showPointerStrip: true,
        pointerLabelComponent: (items: any) => {
          return (
            <View
              style={{
                width: 100,
              }}
            >
              <Text
                style={
                  style.flatten([
                    "color-dark",
                    "text-caption2",
                    "font-medium",
                    "margin-bottom-4",
                    "text-center",
                  ]) as ViewStyle
                }
              >
                {`${currencySymbol}${(items[0].value + minValue).toFixed(2)}`}
              </Text>

              <Text
                style={
                  style.flatten([
                    "text-center",
                    "color-gray-300",
                    "text-caption2",
                    "font-medium",
                  ]) as ViewStyle
                }
              >
                {items[0].date}
              </Text>
            </View>
          );
        },
      }}
    />
  );
};
