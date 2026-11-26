import React from "react";
import { View } from "react-native";
import Toast, { BaseToast, ErrorToast } from "react-native-toast-message";
import { BaseToastProps } from "react-native-toast-message/lib/src/types";
import { XmarkIcon } from "components/new/icon/xmark";

export const toastConfig = {
  /*
    Overwrite 'success' type,
    by modifying the existing `BaseToast` component
  */
  success: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      text1NumberOfLines={2}
      text2NumberOfLines={2}
      style={{ borderLeftColor: "#69C779" }}
      renderTrailingIcon={() => (
        <View
          style={{
            justifyContent: "center",
            alignItems: "center",
            marginHorizontal: 12,
          }}
        >
          <XmarkIcon color={"black"} />
        </View>
      )}
      onPress={Toast.hide}
    />
  ),
  /*
    Overwrite 'error' type,
    by modifying the existing `ErrorToast` component
  */
  error: (props: BaseToastProps) => (
    <ErrorToast
      {...props}
      text1NumberOfLines={2}
      text2NumberOfLines={2}
      renderTrailingIcon={() => (
        <View
          style={{
            justifyContent: "center",
            alignItems: "center",
            marginHorizontal: 12,
          }}
        >
          <XmarkIcon color={"black"} />
        </View>
      )}
      onPress={Toast.hide}
    />
  ),
};
