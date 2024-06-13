import React, { FunctionComponent } from "react";
import Svg, { Path } from "react-native-svg";

export const BridgeIcon: FunctionComponent<{
  size?: number;
  color?: string;
}> = ({ size = 16, color = "white" }) => {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 20 16"
      style={{
        width: size,
        height: size,
      }}
      fill="none"
    >
      <Path
        d="M5.4375 15.75C4.9375 15.75 4.5 15.5625 4.15625 15.2188L0.375 11.4688C0.125 11.2188 0 10.875 0 10.5C0 10.1562 0.125 9.8125 0.375 9.5625L4.15625 5.78125C4.5 5.46875 4.9375 5.25 5.4375 5.25C6.4375 5.25 7.25 6.0625 7.25 7.0625V7.25H9.75H12.75H13H13.25C13.5 7.25 13.75 7.5 13.75 7.75V8V8.25V8.96875C13.75 9.125 13.875 9.25 14.0312 9.25C14.125 9.25 14.2188 9.21875 14.25 9.1875L17.9375 5.5L14.2812 1.84375C14.2188 1.78125 14.125 1.75 14.0625 1.75C13.875 1.75 13.75 1.90625 13.75 2.0625V2.75V3V3.25C13.75 3.53125 13.5 3.75 13.25 3.75H13H12.75H9.75C9.3125 3.75 9 3.4375 9 3C9 2.59375 9.3125 2.25 9.75 2.25H12.25V2.0625C12.25 1.0625 13.0312 0.25 14.0312 0.25C14.5312 0.25 15 0.46875 15.3125 0.78125L19.0938 4.5625C19.3438 4.8125 19.5 5.15625 19.5 5.5C19.5 5.875 19.3438 6.21875 19.0938 6.46875L15.3125 10.2188C15 10.5625 14.5312 10.75 14.0312 10.75C13.0312 10.75 12.25 9.96875 12.25 8.96875V8.75H9.75H6.75H6.5H6.25C5.96875 8.75 5.75 8.53125 5.75 8.25V8V7.75V7.0625C5.75 6.90625 5.59375 6.75 5.4375 6.75C5.34375 6.75 5.25 6.78125 5.21875 6.84375L1.53125 10.5L5.21875 14.1875C5.25 14.2188 5.34375 14.25 5.4375 14.25C5.59375 14.25 5.71875 14.125 5.71875 13.9688V13.25V13V12.75C5.71875 12.5 5.96875 12.25 6.21875 12.25H6.46875H6.71875H9.71875C10.1562 12.25 10.4688 12.5938 10.4688 13C10.4688 13.4375 10.1562 13.75 9.71875 13.75H7.21875V13.9688C7.21875 14.9688 6.4375 15.75 5.4375 15.75Z"
        fill={color}
      />
    </Svg>
  );
};