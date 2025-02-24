import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { PageWithScrollViewInBottomTabView } from "components/page";
import {
  AppState,
  AppStateStatus,
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  ViewStyle,
} from "react-native";
import { useStore } from "stores/index";
import { observer } from "mobx-react-lite";
import { useFocusEffect } from "@react-navigation/native";
import { AccountSection } from "./account-section";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePrevious } from "hooks/use-previous";
import { LineGraphView } from "components/new/line-graph";
import { useStyle } from "styles/index";
import { useFocusedScreen } from "providers/focused-screen";
import { AppUpdateModal } from "./app-update-modal";
import DeviceInfo from "react-native-device-info";
import axios from "axios";
import { useNetInfo } from "@react-native-community/netinfo";

interface OS {
  version: string;
  code: string;
}
interface UpdateData {
  isForceUpdate: boolean;
  iOS: OS;
  android: OS;
}

export const HomeScreen: FunctionComponent = observer(() => {
  const safeAreaInsets = useSafeAreaInsets();
  const netInfo = useNetInfo();

  const style = useStyle();
  const windowHeight = Dimensions.get("window").height;

  const [refreshing, setRefreshing] = useState(false);
  const { chainStore, accountStore, queriesStore, priceStore, activityStore } =
    useStore();

  const [tokenState, setTokenState] = useState({
    percentageDiff: 0,
    diff: 0,
    time: "TODAY",
    type: "positive",
  });
  const [graphHeight, setGraphHeight] = useState(4.2);

  const [appUpdate, setAppUpdate] = useState(false);
  const [appVersion] = useState(() => DeviceInfo.getVersion());
  const [buildNumber] = useState(() => DeviceInfo.getBuildNumber());

  const scrollViewRef = useRef<ScrollView | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentChain = chainStore.current;
  const currentChainId = currentChain.chainId;
  const previousChainId = usePrevious(currentChainId);
  const chainStoreIsInitializing = chainStore.isInitializing;
  const focusedScreen = useFocusedScreen();
  const previousChainStoreIsInitializing = usePrevious(
    chainStoreIsInitializing,
    true
  );

  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);

  const accountOrChainChanged =
    activityStore.getAddress !== account.bech32Address ||
    activityStore.getChainId !== chainStore.current.chainId;

  async function fetchAppVersion(): Promise<UpdateData | undefined> {
    try {
      const apiUrl =
        "https://raw.githubusercontent.com/fetchai/asi-alliance-wallet/main/packages/mobile/update.json";
      const response = await axios.get(apiUrl);
      return response.data;
    } catch {
      return undefined;
    }
  }

  const checkAndUpdateChainInfo = useCallback(() => {
    if (!chainStoreIsInitializing) {
      (async () => {
        try {
          await chainStore.tryUpdateChain(currentChainId);
        } catch (e) {
          console.log(e);
        }
      })();
    }
  }, [chainStore, chainStoreIsInitializing, currentChainId]);

  useEffect(() => {
    const appStateHandler = (state: AppStateStatus) => {
      if (state === "active") {
        checkAndUpdateChainInfo();
      }
    };

    const callback = AppState.addEventListener("change", appStateHandler);

    return () => {
      callback.remove();
    };
  }, [checkAndUpdateChainInfo]);

  useFocusEffect(
    useCallback(() => {
      if (
        (chainStoreIsInitializing !== previousChainStoreIsInitializing &&
          !chainStoreIsInitializing) ||
        currentChainId !== previousChainId
      ) {
        checkAndUpdateChainInfo();
      }
    }, [
      chainStoreIsInitializing,
      previousChainStoreIsInitializing,
      currentChainId,
      previousChainId,
      checkAndUpdateChainInfo,
    ])
  );

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0 });
    }
  }, [chainStore.current.chainId]);

  const onRefresh = React.useCallback(
    async (isLoading: boolean) => {
      // Because the components share the states related to the queries,
      // fetching new query responses here would make query responses on all other components also refresh.
      if (isLoading) setRefreshing(isLoading);

      await Promise.all([
        priceStore.waitFreshResponse(),
        ...queries.queryBalances
          .getQueryBech32Address(account.bech32Address)
          .balances.map((bal) => {
            return bal.waitFreshResponse();
          }),
        queries.cosmos.queryRewards
          .getQueryBech32Address(account.bech32Address)
          .waitFreshResponse(),
        queries.cosmos.queryDelegations
          .getQueryBech32Address(account.bech32Address)
          .waitFreshResponse(),
        queries.cosmos.queryUnbondingDelegations
          .getQueryBech32Address(account.bech32Address)
          .waitFreshResponse(),
        queries.cosmos.querySpendableBalances
          .getQueryBech32Address(account.bech32Address)
          .waitFreshResponse(),
      ]).finally(() => {
        setRefreshing(false);
      });
    },
    [accountStore, chainStore, priceStore, queriesStore]
  );

  function autoRefreshBalances(isLoading: boolean) {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    onRefresh(isLoading);
    intervalRef.current = setInterval(() => onRefresh(false), 30000);

    // Clean up the interval on component unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }

  /// 30 sec Auto-Refresh balances
  useEffect(() => {
    autoRefreshBalances(false);
  }, [chainStore.current.chainId]);

  /// Hide Refreshing when tab change
  useEffect(() => {
    if (focusedScreen.name !== "Home" && refreshing) {
      setRefreshing(false);
    }
  }, [focusedScreen.name, refreshing]);

  useEffect(() => {
    if (accountOrChainChanged) {
      activityStore.setAddress(account.bech32Address);
      activityStore.setChainId(chainStore.current.chainId);
    }
    if (account.bech32Address !== "") {
      activityStore.accountInit();
    }
  }, [
    account.bech32Address,
    accountOrChainChanged,
    activityStore,
    chainStore.current.chainId,
  ]);

  useEffect(() => {
    async function updateApp() {
      const data = await fetchAppVersion();
      if (data) {
        if (data.isForceUpdate) {
          if (Platform.OS === "ios") {
            if (data.iOS.version > appVersion || data.iOS.code > buildNumber) {
              setAppUpdate(true);
            }
          } else {
            if (
              data.android.version > appVersion ||
              data.android.code > buildNumber
            ) {
              setAppUpdate(true);
            }
          }
        }
      }
    }
    updateApp();
  }, [appVersion, buildNumber, netInfo.isConnected]);

  return (
    <PageWithScrollViewInBottomTabView
      backgroundMode={"image"}
      isTransparentHeader={true}
      refreshControl={
        <RefreshControl
          tintColor={"white"}
          refreshing={refreshing}
          onRefresh={() => autoRefreshBalances(true)}
          progressViewOffset={
            Platform.OS === "ios" ? safeAreaInsets.top + 10 : 48
          }
        />
      }
      contentContainerStyle={[
        style.get("flex-grow-1"),
        {
          paddingTop: Platform.OS === "ios" ? safeAreaInsets.top + 10 : 48,
        },
      ]}
      containerStyle={style.flatten(["overflow-scroll"]) as ViewStyle}
      ref={scrollViewRef}
    >
      <AccountSection
        tokenState={tokenState}
        graphHeight={graphHeight}
        setGraphHeight={setGraphHeight}
      />
      <View style={style.flatten(["flex-2"])} />
      <LineGraphView
        setTokenState={setTokenState}
        tokenName={chainStore.current.feeCurrencies[0].coinGeckoId}
        height={windowHeight / graphHeight}
      />
      <AppUpdateModal isOpen={appUpdate} />
    </PageWithScrollViewInBottomTabView>
  );
});
