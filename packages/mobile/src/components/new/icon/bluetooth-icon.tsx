import React, { FunctionComponent } from "react";
import Svg, { Path, Rect } from "react-native-svg";

export const BluetoothIcon: FunctionComponent<{
  size?: number;
  color?: string;
  width?: number;
  height?: number;
}> = ({ width, height }) => {
  return (
    <Svg width={width} height={height} viewBox="0 0 32 32" fill="none">
      <Rect width="32" height="32" rx="16" fill-opacity="0.1" />
      <Path
        d="M9 11.375L18.625 11.375C19.0898 11.375 19.5 11.7852 19.5 12.25L19.5 19.25C19.5 19.7422 19.0898 20.125 18.625 20.125L9 20.125C8.01562 20.125 7.25 19.3594 7.25 18.375L7.25 13.125C7.25 12.168 8.01562 11.375 9 11.375ZM23.875 12.25C24.3398 12.25 24.75 12.6602 24.75 13.125L24.75 18.375C24.75 18.8672 24.3398 19.25 23.875 19.25L20.375 19.25L20.375 12.25L23.875 12.25ZM22.5625 15.0938C22.918 15.0938 23.2187 14.8203 23.2187 14.4375C23.2187 14.082 22.918 13.7813 22.5625 13.7813C22.1797 13.7813 21.9062 14.082 21.9062 14.4375C21.9062 14.8203 22.1797 15.0938 22.5625 15.0938ZM23.2187 17.0625C23.2187 16.707 22.918 16.4063 22.5625 16.4063C22.1797 16.4063 21.9062 16.707 21.9062 17.0625C21.9062 17.4453 22.1797 17.7188 22.5625 17.7188C22.918 17.7188 23.2187 17.4453 23.2187 17.0625Z"
        fill="white"
      />
    </Svg>
  );
};