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
      initialSpacing={0}
      endSpacing={0}
      // y label variable
      showFractionalValues={true}
      maxValue={chartMaxValue}
      yAxisOffset={minValue}
      // y axis variable
      disableScroll={true}
      yAxisThickness={0}
      yAxisColor={"lightgray"}
      hideYAxisText={true}
      xAxisThickness={0}
      // horizontal line vriable
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
