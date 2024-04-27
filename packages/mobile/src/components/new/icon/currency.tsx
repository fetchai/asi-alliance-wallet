import React, { FunctionComponent } from "react";
import Svg, { Path } from "react-native-svg";

export const CurrencyIcon: FunctionComponent<{
  size?: number;
  color?: any;
}> = ({ size = 16, color = "white" }) => {
  return (
    <Svg
      width={size}
      height={size}
      color={color}
      viewBox="0 0 18 16"
      style={{
        width: size,
        height: size,
      }}
      fill="none"
    >
      <Path
        d="M8.28125 12.75C8.4375 12.7188 8.5625 12.6875 8.71875 12.6562C10.4688 12.2188 12.4375 11.6875 14.5 11.75C14.625 10.7812 15.4688 10.0312 16.5 10.0312V4.5C15.375 4.5 14.5 3.625 14.5 2.53125C13.0312 2.46875 11.4688 2.8125 9.6875 3.28125C9.53125 3.3125 9.40625 3.34375 9.25 3.375C7.5 3.8125 5.53125 4.34375 3.46875 4.28125C3.34375 5.25 2.5 6 1.5 6V11.5C2.59375 11.5 3.46875 12.4062 3.5 13.5C4.96875 13.5625 6.5 13.2188 8.28125 12.75ZM0 13.1875V3.53125C0 2.78125 0.78125 2.28125 1.5 2.46875C4 3.15625 6.5 2.53125 9 1.90625C11.6875 1.21875 14.4062 0.5 17.125 1.53125C17.6562 1.71875 18 2.25 18 2.84375V12.4688C18 13.25 17.1875 13.75 16.4688 13.5312C13.9688 12.8438 11.4688 13.5 9 14.125C6.28125 14.8125 3.5625 15.5 0.84375 14.5C0.3125 14.3125 0 13.75 0 13.1875ZM9 11C7.59375 11 6.5 9.65625 6.5 8C6.5 6.34375 7.59375 5 9 5C10.375 5 11.5 6.34375 11.5 8C11.5 9.65625 10.375 11 9 11Z"
        fill={color}
      />
    </Svg>
  );
};