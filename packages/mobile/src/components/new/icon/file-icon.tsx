import React, { FunctionComponent } from "react";
import Svg, { Path } from "react-native-svg";

export const HomeIcon: FunctionComponent<{
  size?: number;
  color?: string;
}> = ({ size = 17, color = "white" }) => {
  return (
    <Svg
      width={size}
      height={size}
      color={color}
      viewBox="0 0 17 14"
      style={{
        width: size,
        height: size,
      }}
      fill="none"
    >
      <Path
        d="M2.69995 0H14.7C15.2312 0 15.7 0.46875 15.7 1C15.7 1.5625 15.2312 2 14.7 2H3.19995C2.9187 2 2.69995 2.25 2.69995 2.5C2.69995 2.78125 2.9187 3 3.19995 3H14.7C15.7937 3 16.7 3.90625 16.7 5V12C16.7 13.125 15.7937 14 14.7 14H2.69995C1.57495 14 0.699951 13.125 0.699951 12V2C0.699951 0.90625 1.57495 0 2.69995 0ZM13.7 7.5C13.1375 7.5 12.7 7.96875 12.7 8.5C12.7 9.0625 13.1375 9.5 13.7 9.5C14.2312 9.5 14.7 9.0625 14.7 8.5C14.7 7.96875 14.2312 7.5 13.7 7.5Z"
        fill={color}
      />
    </Svg>
  );
};
