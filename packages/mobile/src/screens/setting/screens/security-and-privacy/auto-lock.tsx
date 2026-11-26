import React, { FunctionComponent, useEffect, useState } from "react";
import { Platform, Switch, View, ViewStyle } from "react-native";
import { observer } from "mobx-react-lite";
import { SettingItem } from "screens/setting/components";
import { AutoLockTimer } from "components/new/icon/timer-icon";
import { useStyle } from "styles/index";
import { useStore } from "stores/index";
export const AutoLockScreen: FunctionComponent = observer(() => {
  const { keychainStore, analyticsStore } = useStore();
  const [isAutoLockOn, setIsAutoLockOn] = useState(false);
  const style = useStyle();

  useEffect(() => {
    setIsAutoLockOn(keychainStore.isAutoLockOn);
  }, [keychainStore.isAutoLockOn]);

  const handleAutoLockToggle = async (value: boolean) => {
    await keychainStore.toggleAutoLock(value);
    analyticsStore.logEvent("auto_lock_timer_click", {
      pageName: "Security & Privacy",
      action: value.toString(),
    });
  };

  return (
    <View>
      <SettingItem
        label="Auto Lock"
        paragraph="Automatically lock wallet when it is in background"
        style={style.flatten(["height-72", "padding-18"]) as ViewStyle}
        left={<AutoLockTimer size={24} />}
        right={
          <Switch
            trackColor={{
              false: "#767577",
              true: Platform.OS === "ios" ? "#ffffff00" : "#767577",
            }}
            thumbColor={isAutoLockOn ? "#5F38FB" : "#D0BCFF66"}
            style={[
              {
                borderRadius: 16,
                borderWidth: 1,
              },
              style.flatten(["border-color-pink-light@40%"]),
            ]}
            onValueChange={handleAutoLockToggle}
            value={isAutoLockOn}
            accessibilityLabel="Toggle Auto Lock"
          />
        }
      />
    </View>
  );
});
