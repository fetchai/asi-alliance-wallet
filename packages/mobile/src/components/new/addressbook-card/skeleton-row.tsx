import React, { FunctionComponent } from "react";
import { View } from "react-native";

export const SkeletonRow: FunctionComponent<{ wide?: boolean }> = ({
  wide = false,
}) => (
  <View
    style={{
      padding: 12,
      borderRadius: 12,
      marginBottom: 4,
      backgroundColor: "#F5F5F5",
    }}
  >
    <View
      style={{
        height: 14,
        width: wide ? 160 : 120,
        borderRadius: 4,
        backgroundColor: "#E0E0E0",
        marginBottom: 10,
      }}
    />
    <View
      style={{
        height: 12,
        width: wide ? 220 : 180,
        borderRadius: 4,
        backgroundColor: "#E0E0E0",
      }}
    />
  </View>
);
