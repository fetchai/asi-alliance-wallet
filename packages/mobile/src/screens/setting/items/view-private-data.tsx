import React, { FunctionComponent, useState } from "react";
import { SettingItem } from "screens/setting/components";
import { PasswordInputModal } from "modals/password-input/modal";
import { useStore } from "stores/index";
import { useSmartNavigation } from "navigation/smart-navigation";
import { getPrivateDataTitle } from "screens/setting/screens/view-private-data";
import { useStyle } from "styles/index";
import { ViewStyle } from "react-native";
import { KeyIconSmall } from "components/new/icon/key";
import { observer } from "mobx-react-lite";

export const SettingViewPrivateDataItem: FunctionComponent = observer(() => {
  const { keyRingStore, analyticsStore } = useStore();

  const style = useStyle();

  const smartNavigation = useSmartNavigation();

  const [isOpenModal, setIsOpenModal] = useState(false);
  const selectedKeyInfo = keyRingStore.selectedKeyInfo;
  const selectedKeyType = selectedKeyInfo?.type ?? "";

  return (
    <React.Fragment>
      <SettingItem
        label={getPrivateDataTitle(selectedKeyType)}
        left={<KeyIconSmall color="#151a1a" />}
        onPress={() => {
          setIsOpenModal(true);
          analyticsStore.logEvent("view_mnemonic_seed_click", {
            pageName: "Security & Privacy",
          });
        }}
        style={style.flatten(["height-72", "padding-18"]) as ViewStyle}
      />
      <PasswordInputModal
        isOpen={isOpenModal}
        close={() => setIsOpenModal(false)}
        title={`Enter your password to view your ${
          selectedKeyType === "mnemonic" ? "mnemonic seed" : "private key"
        }`}
        onEnterPassword={async (password) => {
          if (selectedKeyInfo) {
            const privateData = await keyRingStore.showKeyRing(
              selectedKeyInfo.id,
              password
            );
            smartNavigation.navigateSmart("Setting.ViewPrivateData", {
              privateData,
              privateDataType: selectedKeyType,
            });
          }
        }}
      />
    </React.Fragment>
  );
});
