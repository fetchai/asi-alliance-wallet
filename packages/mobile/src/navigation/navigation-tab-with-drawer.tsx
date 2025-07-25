import React, { FunctionComponent, useEffect, useRef } from "react";
import { useStyle } from "styles/index";
import { useStore } from "stores/index";
import {
  DrawerActions,
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { useFocusedScreen } from "providers/focused-screen";
import {
  createDrawerNavigator,
  useDrawerStatus,
} from "@react-navigation/drawer";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UpDownArrowIcon } from "components/new/icon/up-down-arrow";
import { ClockIcon } from "components/new/icon/clock-icon";
import { MoreIcon } from "components/new/icon/more-icon";
import { AppState, BackHandler, View, ViewStyle } from "react-native";
import { IconButton } from "components/new/button/icon";
import { BorderlessButton } from "react-native-gesture-handler";
import { BlurredBottomTabBar } from "components/bottom-tabbar";
import { HomeNavigation } from "navigation/home-navigation";
import { DrawerContent } from "components/drawer";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  QuickTabOptionModel,
  QuickTabOptions,
} from "components/new/quick-tab-card/quick-tab-card";
import Toast from "react-native-toast-message";
import { StakeIcon } from "components/new/icon/stake-icon";
import { StakingDashboardScreen } from "screens/stake";
import { HomeIcon } from "components/new/icon/home-icon";
import { ActivityScreen } from "screens/activity";
import { SettingScreen } from "screens/setting";
import { useSmartNavigation } from "navigation/smart-navigation";

const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();
enum screenNames {
  Home = "Home",
  Stake = "Stake",
  Inbox = "Inbox",
  Activity = "Activity",
  More = "More",
}
export const MainTabNavigation: FunctionComponent = () => {
  const style = useStyle();
  const { chainStore, keychainStore, keyRingStore, analyticsStore } =
    useStore();
  const chainId = chainStore.current.chainId;
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const smartNavigation = useSmartNavigation();

  const [isQuickOptionEnable, setQuickOptionEnable] = React.useState(false);
  const backClickCountRef = useRef(0);

  const focusedScreen = useFocusedScreen();
  const isDrawerOpen = useDrawerStatus() === "open";
  const insets = useSafeAreaInsets();

  /// Auto lock app if app in bg
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      /// iOS: inactive, Android: background
      const isBg = nextAppState === "inactive" || nextAppState === "background";

      /// Avoiding screen-lock on register pages
      if (
        isBg &&
        keychainStore.isAutoLockOn &&
        !(
          focusedScreen.name?.startsWith("Register") ||
          focusedScreen.name?.startsWith("Setting.SecurityAndPrivacy")
        )
      ) {
        try {
          await keyRingStore.lock();
          smartNavigation.reset({
            index: 0,
            routes: [{ name: "Unlock" }],
          });
        } catch (error) {
          console.error("Failed to lock key ring", error);
        }
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, [keychainStore.isAutoLockOn, focusedScreen.name]);

  /// Back button handling
  useEffect(() => {
    // When the focused screen is not "Home" screen and the drawer is open,
    // try to close the drawer forcely.
    if (focusedScreen.name !== "Home" && isDrawerOpen) {
      navigation.dispatch(DrawerActions.toggleDrawer());
    }

    switch (focusedScreen.name) {
      case "Home":
        analyticsStore.logEvent("home_tab_click");
        break;

      case "StakeTab":
        analyticsStore.logEvent("stake_tab_click");
        break;

      case "ActivityTab":
        analyticsStore.logEvent("activity_tab_click");
        break;

      case "MoreTab":
        analyticsStore.logEvent("more_tab_click");
        break;
    }

    BackHandler.addEventListener("hardwareBackPress", handleBackButton);
    return () => {
      BackHandler.removeEventListener("hardwareBackPress", handleBackButton);
    };
  }, [focusedScreen.name, isDrawerOpen, navigation]);

  const handleBackButton = () => {
    if (
      focusedScreen.name === "Home" ||
      focusedScreen.name === "StakeTab" ||
      focusedScreen.name === "ActivityTab" ||
      focusedScreen.name === "MoreTab"
    ) {
      if (backClickCountRef.current == 1) {
        BackHandler.exitApp();
      } else {
        backClickCountRef.current++;
        Toast.show({
          type: "error",
          text1: `Press back again to exit the app`,
          visibilityTime: 3000,
        });
      }
      setTimeout(() => {
        backClickCountRef.current = 0;
      }, 3000);
      return true;
    }

    return false;
  };

  return (
    <React.Fragment>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          title: "",
          tabBarIcon: ({ focused }) => {
            switch (route.name) {
              case "HomeTab":
                return (
                  <IconButton
                    icon={<HomeIcon isSelected={focused} />}
                    bottomText={screenNames.Home}
                    backgroundBlur={focused}
                    borderRadius={32}
                    bottomTextStyle={
                      style.flatten([
                        focused ? "color-white" : "color-white@60%",
                      ]) as ViewStyle
                    }
                    iconStyle={
                      style.flatten([
                        "padding-y-8",
                        "padding-x-24",
                        "margin-bottom-6",
                      ]) as ViewStyle
                    }
                    containerStyle={style.flatten(["items-center"])}
                  />
                );
              case "StakeTab":
                return (
                  <IconButton
                    icon={
                      focused ? (
                        <StakeIcon isSelected={true} />
                      ) : (
                        <StakeIcon color={"#FFFFFF90"} />
                      )
                    }
                    bottomText={screenNames.Stake}
                    borderRadius={32}
                    backgroundBlur={focused}
                    iconStyle={
                      style.flatten([
                        "padding-y-8",
                        "padding-x-24",
                        "margin-bottom-6",
                      ]) as ViewStyle
                    }
                    bottomTextStyle={
                      style.flatten([
                        focused ? "color-white" : "color-white@60%",
                      ]) as ViewStyle
                    }
                    containerStyle={style.flatten(["items-center"])}
                  />
                );
              case "InboxTab":
                return (
                  <IconButton
                    icon={<UpDownArrowIcon />}
                    borderRadius={64}
                    backgroundBlur={false}
                    onPress={() => {
                      setQuickOptionEnable(true);
                      analyticsStore.logEvent("fund_transfer_tab_click");
                    }}
                    iconStyle={
                      style.flatten([
                        "padding-16",
                        "background-color-white",
                      ]) as ViewStyle
                    }
                    bottomTextStyle={
                      style.flatten([
                        focused ? "color-white" : "color-white@60%",
                      ]) as ViewStyle
                    }
                  />
                );
              case "ActivityTab":
                return (
                  <IconButton
                    icon={
                      focused ? (
                        <ClockIcon isSelected={true} />
                      ) : (
                        <ClockIcon color={"#FFFFFF90"} />
                      )
                    }
                    bottomText={screenNames.Activity}
                    borderRadius={32}
                    backgroundBlur={focused}
                    iconStyle={
                      style.flatten([
                        "padding-y-8",
                        "padding-x-24",
                        "margin-bottom-6",
                      ]) as ViewStyle
                    }
                    bottomTextStyle={
                      style.flatten([
                        focused ? "color-white" : "color-white@60%",
                      ]) as ViewStyle
                    }
                    containerStyle={style.flatten(["items-center"])}
                  />
                );
              case "MoreTab":
                return (
                  <IconButton
                    icon={<MoreIcon color={focused ? "white" : "#FFFFFF90"} />}
                    bottomText={screenNames.More}
                    borderRadius={32}
                    backgroundBlur={focused}
                    iconStyle={
                      style.flatten([
                        "padding-y-8",
                        "padding-x-24",
                        "margin-bottom-6",
                      ]) as ViewStyle
                    }
                    bottomTextStyle={
                      style.flatten([
                        focused ? "color-white" : "color-white@60%",
                      ]) as ViewStyle
                    }
                    containerStyle={style.flatten(["items-center"])}
                  />
                );
            }
          },
          tabBarButton: (props) => (
            <View
              style={{
                display: "flex",
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
              {/* @ts-ignore */}
              <BorderlessButton
                {...props}
                activeOpacity={1}
                rippleColor={style.get("color-transparent").color}
                style={{
                  height: "100%",
                  aspectRatio: 1.9,
                  maxWidth: "100%",
                }}
              />
            </View>
          ),
          tabBarActiveTint: true,
          tabBarInactiveTint: false,
          tabBarStyle: {
            backgroundColor: style.get("color-indigo-900").color,
            shadowColor: style.get("color-transparent").color,
            elevation: 0,
            paddingVertical: 16,
            paddingHorizontal: 20,
            height: 100 + insets.bottom,
            borderTopWidth: 0,
          },
          showLabel: false,
        })}
        tabBar={(props) => (
          <BlurredBottomTabBar {...props} enabledScreens={["Home"]} />
        )}
      >
        <Tab.Screen name="HomeTab" component={HomeNavigation} />
        <Tab.Screen name="StakeTab" component={StakingDashboardScreen} />
        <Tab.Screen name="InboxTab" component={SettingScreen} />
        <Tab.Screen name="ActivityTab" component={ActivityScreen} />
        <Tab.Screen name="MoreTab" component={SettingScreen} />
      </Tab.Navigator>
      <QuickTabOptionModel
        isOpen={isQuickOptionEnable}
        close={() => {
          setQuickOptionEnable(false);
        }}
        onPress={(event: QuickTabOptions) => {
          switch (event) {
            case QuickTabOptions.receive:
              return navigation.navigate("Others", {
                screen: "Receive",
                params: { chainId: chainId },
              });

            case QuickTabOptions.send:
              return navigation.navigate("Others", {
                screen: "Send",
                params: {
                  currency: chainStore.current.stakeCurrency.coinMinimalDenom,
                },
              });

            case QuickTabOptions.bridge:
              break;
          }
        }}
      />
    </React.Fragment>
  );
};

export const MainTabNavigationWithDrawer: FunctionComponent = () => {
  const style = useStyle();
  const focused = useFocusedScreen();

  return (
    <Drawer.Navigator
      useLegacyImplementation={false}
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        drawerType: "slide",
        // If the focused screen is not "Home" screen,
        // disable the gesture to open drawer.
        swipeEnabled: focused.name === "Home",
        // gestureEnabled: focused.name === "Home",
        overlayColor: style.flatten([
          "color-gray-700@50%",
          "dark:color-gray-700@75%",
        ]).color,
        headerShown: false,
        drawerStyle: { width: "100%" },
      }}
    >
      <Drawer.Screen name="MainTab" component={MainTabNavigation} />
    </Drawer.Navigator>
  );
};
