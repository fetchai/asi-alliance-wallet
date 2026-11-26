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
import { AutoLockScreen } from "screens/setting/screens/security-and-privacy/auto-lock";

export const SecurityAndPrivacyScreen: FunctionComponent = observer(() => {
  const { keychainStore, keyRingStore, chainStore } = useStore();

  const smartNavigation = useSmartNavigation();

  const showPrivateData = canShowPrivateData(keyRingStore.keyRingType);

  const style = useStyle();

  return (
    <PageWithScrollView
      backgroundMode="image"
      contentContainerStyle={style.flatten(["flex-grow-1"])}
      style={style.flatten(["padding-x-page", "margin-top-16"]) as ViewStyle}
      scrollEnabled={false}
    >
      {showPrivateData && <SettingViewPrivateDataItem />}
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
