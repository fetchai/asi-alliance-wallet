import React, { FunctionComponent } from "react";
import Svg, { Path } from "react-native-svg";

export const QRCodeIcon: FunctionComponent<{
  size?: number;
  color?: string;
}> = ({ size = 15, color = "white" }) => {
  return (
    <Svg
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
      }}
      viewBox="0 0 14 14"
      fill="none"
    >
      <Path
        d="M4.5 1.5H1.5V4.5H4.5V1.5ZM1.5 0H4.5C5.3125 0 6 0.6875 6 1.5V4.5C6 5.34375 5.3125 6 4.5 6H1.5C0.65625 6 0 5.34375 0 4.5V1.5C0 0.6875 0.65625 0 1.5 0ZM4.5 9.5H1.5V12.5H4.5V9.5ZM1.5 8H4.5C5.3125 8 6 8.6875 6 9.5V12.5C6 13.3438 5.3125 14 4.5 14H1.5C0.65625 14 0 13.3438 0 12.5V9.5C0 8.6875 0.65625 8 1.5 8ZM9.5 1.5V4.5H12.5V1.5H9.5ZM8 1.5C8 0.6875 8.65625 0 9.5 0H12.5C13.3125 0 14 0.6875 14 1.5V4.5C14 5.34375 13.3125 6 12.5 6H9.5C8.65625 6 8 5.34375 8 4.5V1.5ZM2.25 2.75C2.25 2.5 2.46875 2.25 2.75 2.25H3.25C3.5 2.25 3.75 2.5 3.75 2.75V3.25C3.75 3.53125 3.5 3.75 3.25 3.75H2.75C2.46875 3.75 2.25 3.53125 2.25 3.25V2.75ZM2.75 10.25H3.25C3.5 10.25 3.75 10.5 3.75 10.75V11.25C3.75 11.5312 3.5 11.75 3.25 11.75H2.75C2.46875 11.75 2.25 11.5312 2.25 11.25V10.75C2.25 10.5 2.46875 10.25 2.75 10.25ZM10.25 2.75C10.25 2.5 10.4688 2.25 10.75 2.25H11.25C11.5 2.25 11.75 2.5 11.75 2.75V3.25C11.75 3.53125 11.5 3.75 11.25 3.75H10.75C10.4688 3.75 10.25 3.53125 10.25 3.25V2.75ZM8 8.5C8 8.25 8.21875 8 8.5 8H10.5C10.75 8 11 8.25 11 8.5C11 8.78125 11.2188 9 11.5 9H12.5C12.75 9 13 8.78125 13 8.5C13 8.25 13.2188 8 13.5 8C13.75 8 14 8.25 14 8.5V11.5C14 11.7812 13.75 12 13.5 12H11.5C11.2188 12 11 11.7812 11 11.5C11 11.25 10.75 11 10.5 11C10.2188 11 10 11.25 10 11.5V13.5C10 13.7812 9.75 14 9.5 14H8.5C8.21875 14 8 13.7812 8 13.5V8.5ZM11.5 13C11.75 13 12 13.25 12 13.5C12 13.7812 11.75 14 11.5 14C11.2188 14 11 13.7812 11 13.5C11 13.25 11.2188 13 11.5 13ZM13.5 13C13.75 13 14 13.25 14 13.5C14 13.7812 13.75 14 13.5 14C13.2188 14 13 13.7812 13 13.5C13 13.25 13.2188 13 13.5 13Z"
        fill={color}
      />
    </Svg>
  );
};