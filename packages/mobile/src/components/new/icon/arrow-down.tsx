import React, { FunctionComponent } from "react";
import Svg, { Path } from "react-native-svg";

export const ArrowDownIcon: FunctionComponent<{
  size?: number;
  color?: any;
}> = ({ size = 16, color = "white" }) => {
  return (
    <Svg
      width={size}
      height={size}
      color={color}
      viewBox="0 0 13 14"
      style={{
        width: size,
        height: size,
      }}
      fill="none"
    >
      <Path
        d="M6.1875 13.7812L0.9375 8.28125C0.65625 7.96875 0.65625 7.5 0.96875 7.21875C1.28125 6.9375 1.75 6.9375 2.03125 7.25L6 11.4062V0.75C6 0.34375 6.3125 0 6.75 0C7.15625 0 7.5 0.34375 7.5 0.75V11.4062L11.4375 7.25C11.7188 6.9375 12.2188 6.9375 12.5 7.21875C12.8125 7.5 12.8125 7.96875 12.5312 8.28125L7.28125 13.7812C7.125 13.9375 6.9375 14 6.75 14C6.53125 14 6.34375 13.9375 6.1875 13.7812Z"
        fill={color}
      />
    </Svg>
  );
};
