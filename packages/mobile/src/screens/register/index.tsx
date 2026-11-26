import React, { FunctionComponent, useState } from "react";
import { PageWithView } from "components/page";
import { useStyle } from "styles/index";
import {
  View,
  Image,
  ViewStyle,
  TouchableOpacity,
  Text,
  Platform,
  ScrollView,
} from "react-native";
import { useSmartNavigation } from "navigation/smart-navigation";
import { useRegisterConfig } from "@keplr-wallet/hooks";
import { useStore } from "stores/index";
import { CardModal } from "modals/card";
import { DownloadIcon } from "components/icon";
import { GoogleIcon } from "components/new/icon/google";
import { HeaderAddIcon, HeaderBackButtonIcon } from "components/header/icon";
import { LinearGradientText } from "components/svg/linear-gradient-text";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { IconButton } from "components/new/button/icon";
import { BluetoothIcon } from "components/new/icon/bluetooth-icon";
import { MetaMaskIcon } from "components/new/icon/metamask-icon";
import { TokenCardView } from "components/new/card-view/token-card-view";
import { AppleIcon } from "components/new/icon/apple";
import { FetchIcon } from "components/new/icon/fetch-icon";
import {
  NavigationProp,
  ParamListBase,
  RouteProp,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { KeyIconLarge } from "components/new/icon/key";

const SelectWalletOptionCard: FunctionComponent<{
  img: any;
  title: string;
  desc: string;
  onPress?: () => void;
}> = ({ img, title, desc, onPress }) => {
  const style = useStyle();

  return (
    <React.Fragment>
      <TouchableOpacity onPress={onPress} activeOpacity={1}>
        <BlurBackground
          blurIntensity={12}
          borderRadius={16}
          containerStyle={
            style.flatten(["padding-18", "flex-row"]) as ViewStyle
          }
        >
          <IconButton
            iconStyle={
              style.flatten([
                "width-32",
                "height-32",
                "items-center",
                "justify-center",
              ]) as ViewStyle
            }
            icon={img}
            backgroundBlur={true}
            blurIntensity={25}
          />
          <View style={style.flatten(["padding-x-24"]) as ViewStyle}>
            <Text
              style={
                style.flatten([
                  "subtitle2",
                  "margin-bottom-10",
                  "color-white",
                ]) as ViewStyle
              }
            >
              {title}
            </Text>
            <Text
              style={style.flatten(["color-gray-100", "body3"]) as ViewStyle}
            >
              {desc}
            </Text>
          </View>
        </BlurBackground>
      </TouchableOpacity>
    </React.Fragment>
  );
};

export const RegisterIntroScreen: FunctionComponent = () => {
  const { keyRingStore, analyticsStore } = useStore();

  const style = useStyle();

  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          isBack: boolean | undefined;
        }
      >,
      any
    >
  >();

  const isBackBtnVisible = route.params?.isBack ?? true;

  const smartNavigation = useSmartNavigation();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const registerConfig = useRegisterConfig(keyRingStore, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportWalletModalOpen, setImportWalletModalOpen] = useState(false);

  return (
    <PageWithView
      backgroundMode="image"
      isTransparentHeader={true}
      style={[
        style.flatten(["padding-x-page"]) as ViewStyle,
        {
          paddingTop: Platform.OS === "ios" ? 10 : 48,
        },
      ]}
    >
      <View style={style.flatten(["justify-between"]) as ViewStyle}>
        <View
          style={
            style.flatten(["margin-bottom-16", "justify-center"]) as ViewStyle
          }
        >
          <View style={style.flatten(["items-center"]) as ViewStyle}>
            <Image
              source={require("assets/logo/logo.png")}
              style={{
                aspectRatio: 2.977,
              }}
              resizeMode="contain"
              fadeDuration={0}
            />
          </View>
          {isBackBtnVisible ? (
            <IconButton
              icon={<HeaderBackButtonIcon color="white" size={21} />}
              backgroundBlur={false}
              onPress={() => navigation.goBack()}
              containerStyle={style.flatten(["absolute"])}
              iconStyle={
                style.flatten([
                  "width-54",
                  "border-width-1",
                  "border-color-gray-300",
                  "padding-x-14",
                  "padding-y-6",
                  "justify-center",
                  "items-center",
                ]) as ViewStyle
              }
            />
          ) : null}
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={[{ overflow: "scroll", height: "100%" }]}
        >
          <View style={{ gap: 12, marginTop: 16 }}>
            <View>
              <Text
                style={
                  style.flatten([
                    "h1",
                    "font-normal",
                    "color-white",
                    "padding-top-10",
                  ]) as ViewStyle
                }
              >
                Welcome to your
              </Text>
              <LinearGradientText
                text="ASI Alliance Wallet"
                color1="#CF447B"
                color2="#F9774B"
                textCenter={false}
              />
              <Text
                style={
                  style.flatten([
                    "body1",
                    "color-gray-100",
                    "padding-y-24",
                  ]) as ViewStyle
                }
              >
                Choose how you want to proceed
              </Text>
            </View>
            <SelectWalletOptionCard
              img={<HeaderAddIcon color="white" size={17} />}
              title="Create a new wallet"
              desc="Create a wallet to store, send, receive and invest in thousands of crypto assets"
              onPress={() => {
                setIsModalOpen(true);
                analyticsStore.logEvent("create_a_new_wallet_click", {
                  pageName: "Register",
                  registerType: "seed",
                  accountType: "mnemonic",
                });
              }}
            />
            <SelectWalletOptionCard
              img={<DownloadIcon color="white" size={16} />}
              title="Import a wallet"
              desc="Access your existing wallet using a recovery phrase / private key"
              onPress={() => {
                setImportWalletModalOpen(true);
                analyticsStore.logEvent("import_a_wallet_click", {
                  pageName: "Register",
                  registerType: "seed",
                });
              }}
            />
            <NewWalletModal
              isOpen={isModalOpen}
              close={() => setIsModalOpen(false)}
              onSelectGoogle={() => {
                setIsModalOpen(false);
                smartNavigation.navigateSmart("Register.TorusSignIn", {
                  registerConfig,
                  type: "google",
                });
                analyticsStore.logEvent("continue_with_google_click", {
                  registerType: "google",
                  pageName: "Register",
                });
              }}
              onSelectApple={() => {
                setIsModalOpen(false);
                analyticsStore.logEvent("continue_with_apple_click", {
                  registerType: "apple",
                  pageName: "Register",
                });
                smartNavigation.navigateSmart("Register.TorusSignIn", {
                  registerConfig,
                  type: "apple",
                });
              }}
              onSelectNewMnemonic={() => {
                setIsModalOpen(false);
                smartNavigation.navigateSmart("Register.NewMnemonic", {
                  registerConfig,
                });
                analyticsStore.logEvent("create_new_seed_phrase_click", {
                  registerType: "seed",
                  pageName: "Register",
                  accountType: "mnemonic",
                });
              }}
            />
            <ImportExistingWalletModal
              isOpen={isImportWalletModalOpen}
              close={() => setImportWalletModalOpen(false)}
              onImportExistingWallet={() => {
                setImportWalletModalOpen(false);
                smartNavigation.navigateSmart("Register.RecoverMnemonic", {
                  registerConfig,
                });
                analyticsStore.logEvent(
                  "use_a_seed_phrase_or_a_private_key_click",
                  { pageName: "Register", registerType: "seed" }
                );
              }}
              onMigrateFromETH={() => {
                setImportWalletModalOpen(false);
                smartNavigation.navigateSmart("Register.MigrateETH", {
                  registerConfig,
                });
                analyticsStore.logEvent("migrate_from_eth_click", {
                  registerType: "seed",
                  pageName: "Register",
                  accountType: "mnemonic",
                });
              }}
              onImportFromFetch={() => {
                setImportWalletModalOpen(false);
                smartNavigation.navigateSmart(
                  "Register.ImportFromExtension.Intro",
                  {
                    registerConfig,
                  }
                );
                analyticsStore.logEvent(
                  "import_from_asi_alliance_web_extension_click",
                  {
                    registerType: "qr",
                    pageName: "Register",
                  }
                );
              }}
              onConnectLedger={() => {
                setImportWalletModalOpen(false);
                smartNavigation.navigateSmart("Register.Ledger", {
                  registerConfig,
                });
                analyticsStore.logEvent("connect_hardware_wallet_click", {
                  registerType: "ledger",
                  accountType: "ledger",
                  pageName: "Register",
                });
              }}
            />
            <View style={style.get("height-page-double-pad") as ViewStyle} />
          </View>
        </ScrollView>
      </View>
    </PageWithView>
  );
};

export const NewWalletModal: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  onSelectGoogle: () => void;
  onSelectApple: () => void;
  onSelectNewMnemonic: () => void;
}> = ({
  isOpen,
  onSelectGoogle,
  onSelectApple,
  onSelectNewMnemonic,
  close,
}) => {
  const style = useStyle();

  if (!isOpen) {
    return null;
  }

  return (
    <CardModal
      isOpen={isOpen}
      title="Create a new wallet"
      close={() => close()}
    >
      <TokenCardView
        title="Continue with Google"
        leadingIcon={<GoogleIcon width={30} height={30} />}
        subtitle={"Powered by Web3Auth"}
        containerStyle={
          style.flatten(["margin-bottom-6", "height-80"]) as ViewStyle
        }
        titleStyle={
          style.flatten(["text-caption1", "font-medium"]) as ViewStyle
        }
        onPress={() => {
          onSelectGoogle();
        }}
      />
      {Platform.OS === "ios" ? (
        <TokenCardView
          title="Continue with Apple"
          leadingIcon={<AppleIcon width={30} height={30} />}
          containerStyle={
            style.flatten(["margin-bottom-6", "height-80"]) as ViewStyle
          }
          titleStyle={
            style.flatten(["text-caption1", "font-medium"]) as ViewStyle
          }
          onPress={() => {
            onSelectApple();
          }}
        />
      ) : null}

      <TokenCardView
        title="Create new seed phrase"
        leadingIcon={
          <BlurBackground blurIntensity={18}>
            <KeyIconLarge />
          </BlurBackground>
        }
        containerStyle={
          style.flatten(["margin-bottom-6", "height-80"]) as ViewStyle
        }
        titleStyle={
          style.flatten(["text-caption1", "font-medium"]) as ViewStyle
        }
        onPress={() => {
          onSelectNewMnemonic();
        }}
      />
    </CardModal>
  );
};

export const ImportExistingWalletModal: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  onImportExistingWallet: () => void;
  onImportFromFetch: () => void;
  onConnectLedger: () => void;
  onMigrateFromETH: () => void;
}> = ({
  isOpen,
  onImportExistingWallet,
  onImportFromFetch,
  onConnectLedger,
  onMigrateFromETH,
  close,
}) => {
  const style = useStyle();

  if (!isOpen) {
    return null;
  }

  return (
    <CardModal
      isOpen={isOpen}
      title="Import existing wallet"
      close={() => close()}
    >
      <TokenCardView
        title="Import from ASI Alliance Web extension"
        leadingIcon={<FetchIcon size={30} />}
        containerStyle={
          style.flatten(["margin-bottom-6", "height-80"]) as ViewStyle
        }
        titleStyle={
          style.flatten(["text-caption1", "font-medium"]) as ViewStyle
        }
        onPress={onImportFromFetch}
      />
      <TokenCardView
        title="Use a seed phrase or a private key"
        leadingIcon={
          <BlurBackground blurIntensity={18}>
            <KeyIconLarge />
          </BlurBackground>
        }
        containerStyle={
          style.flatten(["margin-bottom-6", "height-80"]) as ViewStyle
        }
        titleStyle={
          style.flatten(["text-caption1", "font-medium"]) as ViewStyle
        }
        onPress={onImportExistingWallet}
      />
      <TokenCardView
        title="Connect hardware wallet"
        leadingIcon={
          <BlurBackground blurIntensity={18}>
            <BluetoothIcon width={30} height={30} />
          </BlurBackground>
        }
        containerStyle={
          style.flatten(["margin-bottom-6", "height-80"]) as ViewStyle
        }
        titleStyle={
          style.flatten(["text-caption1", "font-medium"]) as ViewStyle
        }
        subtitle={"Requires bluetooth access to pair"}
        onPress={onConnectLedger}
      />
      <TokenCardView
        title="Migrate from ETH"
        leadingIcon={
          <BlurBackground blurIntensity={18}>
            <MetaMaskIcon size={30} />
          </BlurBackground>
        }
        containerStyle={
          style.flatten(["margin-bottom-6", "height-80"]) as ViewStyle
        }
        titleStyle={
          style.flatten(["text-caption1", "font-medium"]) as ViewStyle
        }
        onPress={onMigrateFromETH}
      />
    </CardModal>
  );
};
