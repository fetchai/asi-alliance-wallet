import React, { FunctionComponent } from "react";
import { ViewStyle } from "react-native";
import { observer } from "mobx-react-lite";
import { PageWithScrollView } from "components/page";
import { SettingViewPrivateDataItem } from "screens/setting/items/view-private-data";
import { SettingBiometricLockItem } from "screens/setting/items/biometric-lock";
import { useStore } from "stores/index";
import { canShowPrivateData } from "screens/setting/screens/view-private-data";
import { useStyle } from "styles/index";
import { SettingItem } from "screens/setting/components";
import { useSmartNavigation } from "navigation/smart-navigation";
import { EndPointIcon } from "components/new/icon/endpoint";
import { LockIcon } from "components/new/icon/lock";
import { AutoLockScreen } from "screens/setting/screens/security-and-privacy/auto-lock";

export const SecurityAndPrivacyScreen: FunctionComponent = observer(() => {
  const { keychainStore, keyRingStore, chainStore } = useStore();

  const smartNavigation = useSmartNavigation();

  const showPrivateData = canShowPrivateData(keyRingStore.keyRingType);

  const style = useStyle();

  return (
    <PageWithScrollView
      backgroundMode="secondary"
      hasFloatingHeader={true}
      contentContainerStyle={
        style.flatten([
          "flex-grow-1",
          "margin-top-16",
          "padding-top-0",
        ]) as ViewStyle
      }
      style={style.flatten(["padding-x-page"]) as ViewStyle}
      scrollEnabled={false}
    >
      {showPrivateData && <SettingViewPrivateDataItem />}
      <SettingItem
        label="Change Password"
        style={style.flatten(["height-72", "padding-18"]) as ViewStyle}
        left={<LockIcon size={18} color="#151a1a" />}
        onPress={() => {
          smartNavigation.navigateSmart("Setting.ChangePassword", {});
        }}
      />
      {keychainStore.isBiometrySupported || keychainStore.isBiometryOn ? (
        <SettingBiometricLockItem />
      ) : null}
      <AutoLockScreen />
      {chainStore.current.chainId === "test" && (
        <SettingItem
          label="Endpoints"
          style={style.flatten(["height-72", "padding-18"]) as ViewStyle}
          left={<EndPointIcon size={18} />}
          onPress={() => {
            smartNavigation.navigateSmart("Setting.Endpoint", {});
          }}
        />
      )}
    </PageWithScrollView>
  );
});
