import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import { LineChart } from "react-native-svg-charts";
import * as shape from "d3-shape";
import { Circle, G, Text as SvgText, Path, Rect, Line } from "react-native-svg";
import { PanResponder, Dimensions, View } from "react-native";

export const AndroidLineChart: FunctionComponent<{
  data: any;
  height?: number;
  currencySymbol: string | undefined;
  loading: boolean;
}> = ({ data, height, currencySymbol, loading }) => {
  const valueList = data.map((d: { value: any }) => d.value);
  const dateList = data.map((d: { date: any }) => d.date);

  const apx = (size = 0) => {
    const width = Dimensions.get("window").width;
    return (width / 750) * size;
  };
  const size = useRef(dateList.length);

  useEffect(() => {
    size.current = dateList.length;
  }, [dateList]);

  const [positionX, setPositionX] = useState(-1); // The currently selected X coordinate position

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_evt, _gestureState) => true,
      onStartShouldSetPanResponderCapture: (_evt, _gestureState) => true,
      onMoveShouldSetPanResponder: (_evt, _gestureState) => true,
      onMoveShouldSetPanResponderCapture: (_evt, _gestureState) => true,
      onPanResponderTerminationRequest: (_evt, _gestureState) => true,

      onPanResponderGrant: (evt, _gestureState) => {
        updatePosition(evt.nativeEvent.locationX);
        return true;
      },
      onPanResponderMove: (evt, _gestureState) => {
        updatePosition(evt.nativeEvent.locationX);
        return true;
      },
      onPanResponderRelease: () => {
        setPositionX(-1);
      },
    })
  );

  const updatePosition = (x: number) => {
    const YAxisWidth = apx(100);
    const x0 = YAxisWidth; // chart starts after left Y axis
    const chartWidth = apx(750) - x0;
    const xN = x0 + chartWidth; //xN position
    const xDistance = chartWidth / size.current; // The width of each coordinate point
    if (x <= x0) {
      x = x0;
    }
    if (x >= xN) {
      x = xN;
    }

    let value = Number(((x - x0) / xDistance).toFixed(0));
    if (value >= size.current - 1) {
      value = size.current - 1; // Out of chart range, automatic correction
    }

    setPositionX(Number(value));
  };

  const dataMin = Math.min(...valueList);
  const dataMax = Math.max(...valueList);

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
    getSignificantDecimals(dataMin),
    getSignificantDecimals(dataMax)
  );

  const formatPrice = (value: number) => {
    if (Number.isInteger(value)) return `${currencySymbol}${value}`;
    return `${currencySymbol}${value.toFixed(maxDecimals)}`;
  };

  const YAxisLabels = ({ y }: any) => {
    const min = Math.min(...valueList);
    const max = Math.max(...valueList);
    if (min === max) return null;
    return (
      <G>
        <SvgText
          x={apx(10)}
          y={y(max) + apx(22)}
          fill="#9A9AA2"
          fontSize={apx(22)}
          textAnchor="start"
        >
          {formatPrice(max)}
        </SvgText>
        <SvgText
          x={apx(10)}
          y={y(min) - apx(8)}
          fill="#9A9AA2"
          fontSize={apx(22)}
          textAnchor="start"
        >
          {formatPrice(min)}
        </SvgText>
      </G>
    );
  };

  const Tooltip = ({ x, y }: any) => {
    if (positionX < 0) {
      return null;
    }

    const date = dateList[positionX];

    return (
      <G x={x(positionX)} key="tooltip">
        <G
          x={
            positionX > size.current / 1.2
              ? -apx(170 + 10)
              : positionX < size.current / 10
              ? apx(5)
              : -apx(70)
          }
          y={
            y(valueList[positionX]) > 100
              ? y(valueList[positionX]) - apx(100)
              : y(valueList[positionX]) - apx(-70)
          }
        >
          <Rect y={-apx(24 + 24 + 20) / 2} />
          <SvgText
            x={apx(45)}
            fontSize={apx(24)}
            fontWeight="bold"
            fill="#151a1a"
          >
            {`${currencySymbol}${valueList[positionX]}`}
          </SvgText>
          <SvgText
            x={apx(20)}
            y={apx(24 + 20)}
            fill="#9A9AA2"
            fontSize={apx(24)}
          >
            {date}
          </SvgText>
        </G>

        <G x={x}>
          <Circle
            cy={y(valueList[positionX])}
            r={apx(20 / 2)}
            stroke="#fff"
            strokeWidth={apx(2)}
            fill="#73A271"
          />
          <Line
            y1={y(valueList[positionX])}
            y2={200}
            stroke="#9A9AA2"
            strokeWidth={apx(3)}
            strokeDasharray={[6, 6]}
          />
        </G>
      </G>
    );
  };

  const CustomLine = ({ line }: any) => (
    <Path key="line" d={line} strokeWidth={apx(1)} fill="none" />
  );

  const dynamicHeight = height && height >= 200 ? height : 200;
  return (
    <View {...panResponder.current.panHandlers}>
      <LineChart
        style={{ height: dynamicHeight }}
        data={valueList}
        contentInset={{ top: 20, bottom: 20, left: apx(100), right: 5 }}
        animate={false}
        curve={shape.curveNatural}
        svg={{
          strokeWidth: 2,
          stroke: loading ? "#DCDCE3" : "#151a1a",
        }}
      >
        <CustomLine />
        <YAxisLabels />
        <Tooltip />
      </LineChart>
    </View>
  );
};
