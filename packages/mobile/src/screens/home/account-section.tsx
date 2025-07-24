import React, { FunctionComponent, useEffect, useState } from "react";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { ChipButton } from "components/new/chip";
import { AddressCopyable } from "components/new/address-copyable";
import {
  DrawerActions,
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { useStore } from "stores/index";
import { IconButton } from "components/new/button/icon";
import {
  ManageWalletOption,
  WalletCardModel,
} from "components/new/wallet-card/wallet-card";
import { ChangeWalletCardModel } from "components/new/wallet-card/change-wallet";
import { useLoadingScreen } from "providers/loading-screen";
import { ChevronDownIcon } from "components/new/icon/chevron-down";
import {
  numberLocalFormat,
  separateNumericAndDenom,
  titleCase,
} from "utils/format/format";
import { BlurButton } from "components/new/button/blur-button";
import { ThreeDotIcon } from "components/new/icon/three-dot";
import { useSmartNavigation } from "navigation/smart-navigation";
import { CameraPermissionModal } from "components/new/camera-permission-model/camera-permission";
import { Camera, PermissionStatus } from "expo-camera";
import {
  ModelStatus,
  handleOpenSettings,
} from "screens/register/import-from-extension/intro";
import { QRCodeIcon } from "components/new/icon/qrcode-icon";
import { NotificationIcon } from "components/new/icon/notification";
import { CameraPermissionOffIcon } from "components/new/icon/camerapermission-off";
import { CameraPermissionOnIcon } from "components/new/icon/camerapermission-on";
import { useNetInfo } from "@react-native-community/netinfo";
import Toast from "react-native-toast-message";
import { TransactionModal } from "modals/transaction";
import { ClaimRewardsModal } from "components/new/claim-reward-model";
import { Dec } from "@keplr-wallet/unit";
import { TxnStatus, txType } from "components/new/txn-status.tsx";
import { BalanceCard } from "./balance-card";
import { ClaimCard } from "./claim-card";
import { observer } from "mobx-react-lite";
import { fetchProposalNodes } from "screens/activity/utils";

export const AccountSection: FunctionComponent<{
  containerStyle?: ViewStyle;
  tokenState: any;
  graphHeight: number;
  setGraphHeight: any;
}> = observer(({ containerStyle, tokenState, graphHeight, setGraphHeight }) => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const smartNavigation = useSmartNavigation();
  const loadingScreen = useLoadingScreen();
  const style = useStyle();
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [changeWalletModal, setChangeWalletModal] = useState(false);
  const [openCameraModel, setIsOpenCameraModel] = useState(false);
  const [modelStatus, setModelStatus] = useState(ModelStatus.First);
  const [currentTxnType, setCurrentTxnType] = useState<string>("");
  const [txnObj, setTxnObj] = useState({
    txnHash: "",
    txnStatusModal: false,
  });
  const [showClaimModel, setClaimModel] = useState(false);
  const [loadingClaimButton, setLoadingClaimButton] = useState(false);

  const {
    chainStore,
    accountStore,
    queriesStore,
    priceStore,
    keyRingStore,
    analyticsStore,
    activityStore,
  } = useStore();
  const chainInfo = chainStore.getChain(chainStore.current.chainId);

  const netInfo = useNetInfo();
  const networkIsConnected =
    typeof netInfo.isConnected !== "boolean" || netInfo.isConnected;

  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);

  const queryStakable = queries.queryBalances.getQueryBech32Address(
    account.bech32Address
  ).stakable;
  const stakable = queryStakable.balance;

  const queryDelegated = queries.cosmos.queryDelegations.getQueryBech32Address(
    account.bech32Address
  );
  const delegated = queryDelegated.total;
  const queryUnbonding =
    queries.cosmos.queryUnbondingDelegations.getQueryBech32Address(
      account.bech32Address
    );
  const rewards = queries.cosmos.queryRewards.getQueryBech32Address(
    account.bech32Address
  );
  const stakableReward = rewards.stakableReward;

  const unbonding = queryUnbonding.total;

  const stakedSum = delegated.add(unbonding);

  const total = stakable.add(stakedSum).add(stakableReward);

  const totalPrice = priceStore.calculatePrice(total);

  const { numericPart: totalNumber, denomPart: totalDenom } =
    separateNumericAndDenom(
      total.shrink(true).trim(true).maxDecimals(6).toString()
    );
  const changeInDollarsValue =
    tokenState.type === "positive"
      ? tokenState.diff / 100
      : -tokenState.diff / 100;

  const accountOrChainChanged =
    activityStore.getAddress !== account.bech32Address ||
    activityStore.getChainId !== chainStore.current.chainId;

  async function onSubmit() {
    const validatorAddresses =
      rewards.getDescendingPendingRewardValidatorAddresses(8);
    const tx =
      account.cosmos.makeWithdrawDelegationRewardTx(validatorAddresses);
    setLoadingClaimButton(true);

    try {
      analyticsStore.logEvent("claim_click", {
        pageName: "Home",
      });
      let gas =
        account.cosmos.msgOpts.withdrawRewards.gas * validatorAddresses.length;

      // Gas adjustment is 1.5
      // Since there is currently no convenient way to adjust the gas adjustment on the UI,
      // Use high gas adjustment to prevent failure.
      try {
        gas = (await tx.simulate()).gasUsed * 1.5;
      } catch (e) {
        // Some chain with older version of cosmos sdk (below @0.43 version) can't handle the simulation.
        // Therefore, the failure is expected. If the simulation fails, simply use the default value.
        console.log(e);
      }
      setClaimModel(false);
      Toast.show({
        type: "success",
        text1: "claim in process",
      });
      await tx.send({ amount: [], gas: gas.toString() }, "", undefined, {
        onBroadcasted: (txHash) => {
          setLoadingClaimButton(false);
          analyticsStore.logEvent("claim_txn_broadcasted", {
            chainId: chainStore.current.chainId,
            chainName: chainStore.current.chainName,
            pageName: "Home",
          });
          setTxnObj({
            txnHash: Buffer.from(txHash).toString("hex"),
            txnStatusModal: true,
          });
        },
      });
    } catch (e) {
      if (
        e?.message === "Request rejected" ||
        e?.message === "Transaction rejected"
      ) {
        Toast.show({
          type: "error",
          text1: "Transaction rejected",
        });
        return;
      } else {
        Toast.show({
          type: "error",
          text1: e?.message,
        });
      }
      console.log(e);
      analyticsStore.logEvent("claim_txn_broadcasted_fail", {
        chainId: chainStore.current.chainId,
        chainName: chainStore.current.chainName,
        pageName: "Home",
      });
      navigation.navigate("Home", {});
    } finally {
      setLoadingClaimButton(false);
      setClaimModel(false);
    }
  }

  function isShowClaimOption(): boolean {
    return !(
      !networkIsConnected ||
      !account.isReadyToSendTx ||
      stakableReward.toDec().equals(new Dec(0)) ||
      stakable.toDec().lte(new Dec(0)) ||
      rewards.pendingRewardValidatorAddresses.length === 0
    );
  }

  useEffect(() => {
    const isHeightChanged = isShowClaimOption();
    if (isHeightChanged && graphHeight == 4.2) {
      setGraphHeight(4.5);
    } else if (!isHeightChanged && graphHeight == 4.5) {
      setGraphHeight(4.2);
    }
  }, [isShowClaimOption]);

  useEffect(() => {
    /*  this is required because accountInit sets the nodes on reload,
        so we wait for accountInit to set the proposal nodes and then we 
        store the proposal votes from api in activity store */
    const timeout = setTimeout(async () => {
      const nodes = activityStore.sortedNodesProposals;
      if (nodes.length === 0) {
        const nodes = await fetchProposalNodes(
          "",
          chainStore.current.chainId,
          account.bech32Address
        );
        if (nodes.length) {
          nodes.forEach((node: any) => activityStore.addProposalNode(node));
        }
      }
    }, 3000);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    account.bech32Address,
    chainStore.current.chainId,
    accountOrChainChanged,
    activityStore,
  ]);

  useEffect(() => {
    if (Object.values(activityStore.getPendingTxn).length > 0) {
      const txns: any = Object.values(activityStore.getPendingTxn);
      if (currentTxnType != txns[0].type) {
        setCurrentTxnType(txns[0].type);
      }
    }
  }, [activityStore.getPendingTxn]);

  return (
    <View style={style.flatten(["padding-x-page"]) as ViewStyle}>
      <View
        style={
          style.flatten([
            "flex-row",
            "justify-between",
            "items-center",
          ]) as ViewStyle
        }
      >
        <ChipButton
          backgroundBlur={false}
          containerStyle={
            style.flatten([
              "border-width-1",
              "border-color-white@20%",
            ]) as ViewStyle
          }
          text={titleCase(chainStore.current.chainName)}
          icon={<ChevronDownIcon size={12} />}
          onPress={() => {
            navigation.dispatch(DrawerActions.toggleDrawer());
            analyticsStore.logEvent("chain_change_click", {
              chainId: chainStore.current.chainId,
              chainName: chainStore.current.chainName,
              toChainId: chainInfo.chainId,
              toChainName: chainInfo.chainName,
            });
          }}
        />
        <View style={style.flatten(["flex-row"])}>
          <IconButton
            borderRadius={32}
            icon={<QRCodeIcon size={15} />}
            backgroundBlur={false}
            onPress={async () => {
              const permission = await Camera.getCameraPermissionsAsync();
              if (permission?.status == PermissionStatus.UNDETERMINED) {
                setIsOpenCameraModel(true);
              } else {
                if (!permission?.granted) {
                  setModelStatus(ModelStatus.Second);
                  setIsOpenCameraModel(true);
                } else {
                  smartNavigation.navigateSmart("Camera", {
                    showMyQRButton: false,
                  });
                  analyticsStore.logEvent("qr_code_click", {
                    pageName: "Home",
                  });
                }
              }
            }}
            iconStyle={
              style.flatten([
                "border-width-1",
                "border-color-white@20%",
                "padding-x-12",
                "padding-y-6",
                "justify-center",
                "margin-right-12",
              ]) as ViewStyle
            }
          />
          <IconButton
            borderRadius={32}
            icon={<NotificationIcon size={15} />}
            backgroundBlur={false}
            onPress={() => smartNavigation.navigateSmart("Inbox", {})}
            iconStyle={
              style.flatten([
                "border-width-1",
                "border-color-white@20%",
                "padding-x-12",
                "padding-y-6",
                "justify-center",
                "display-none",
              ]) as ViewStyle
            }
          />
        </View>
      </View>
      <BlurBackground
        borderRadius={14}
        blurIntensity={16}
        containerStyle={
          [
            style.flatten([
              "flex-row",
              "justify-between",
              "items-center",
              "margin-top-24",
              "margin-bottom-12",
              "padding-x-16",
              "padding-y-12",
              "border-width-1",
              "border-color-indigo-20",
            ]),
            containerStyle,
          ] as ViewStyle
        }
      >
        <View style={style.flatten(["flex-3"]) as ViewStyle}>
          <Text style={style.flatten(["body3", "color-white"]) as ViewStyle}>
            {account.name}
          </Text>
          <AddressCopyable address={account.bech32Address} maxCharacters={16} />
        </View>
        <IconButton
          backgroundBlur={false}
          icon={<ThreeDotIcon size={15} />}
          iconStyle={
            style.flatten([
              "width-32",
              "height-32",
              "border-radius-64",
              "items-center",
              "justify-center",
            ]) as ViewStyle
          }
          containerStyle={style.flatten(["flex-1", "items-end"]) as ViewStyle}
          onPress={() => setIsOpenModal(true)}
        />
      </BlurBackground>
      <ClaimCard
        setClaimModel={setClaimModel}
        loadingClaimButton={loadingClaimButton}
        isShowClaimOption={isShowClaimOption()}
      />
      {Object.values(activityStore.getPendingTxn).length > 0 && (
        <TxnStatus
          txnType={
            Object.values(activityStore.getPendingTxn).length > 1
              ? `${
                  Object.values(activityStore.getPendingTxn).length
                } transactions`
              : txType[currentTxnType]
          }
          containerStyle={style.flatten(["margin-top-12"]) as ViewStyle}
        />
      )}
      <View style={style.flatten(["items-center"]) as ViewStyle}>
        <BalanceCard
          loading={!stakedSum.isReady}
          totalPrice={totalPrice}
          totalNumber={totalNumber}
          totalDenom={totalDenom}
        />
        {tokenState ? (
          <View
            style={
              style.flatten([
                "flex-row",
                "items-center",
                "justify-center",
                "width-full",
              ]) as ViewStyle
            }
          >
            <Text
              style={
                style.flatten(
                  ["color-orange-400", "body3"],
                  [tokenState.type === "positive" && "color-vibrant-green-500"]
                ) as ViewStyle
              }
            >
              {`${
                priceStore.getFiatCurrency(priceStore.defaultVsCurrency)
                  ?.symbolName
              } ${changeInDollarsValue.toFixed(4)} (${
                tokenState.type === "positive" ? "+" : "-"
              }${
                Number.isNaN(parseFloat(tokenState.percentageDiff))
                  ? "0"
                  : parseFloat(tokenState.percentageDiff)?.toFixed(1)
              } %)`}
            </Text>
            <Text
              style={
                style.flatten([
                  "color-white@60%",
                  "body3",
                  "margin-left-4",
                ]) as ViewStyle
              }
            >
              {tokenState.time}
            </Text>
          </View>
        ) : null}
        <BlurButton
          backgroundBlur={false}
          containerStyle={
            style.flatten([
              "padding-x-12",
              "border-width-1",
              "border-color-white@20%",
              "margin-top-24",
              "border-radius-32",
            ]) as ViewStyle
          }
          textStyle={style.flatten(["body3"]) as ViewStyle}
          text={"View portfolio"}
          onPress={() => {
            navigation.navigate("Portfolio");
            analyticsStore.logEvent("view_portfolio_click", {
              pageName: "Home",
            });
          }}
        />
      </View>
      <WalletCardModel
        isOpen={isOpenModal}
        title="Manage Wallet"
        accountName={account.name}
        close={() => setIsOpenModal(false)}
        onSelectWallet={(option: ManageWalletOption) => {
          switch (option) {
            case ManageWalletOption.addNewWallet:
              analyticsStore.logEvent("add_new_wallet_click", {
                pageName: "Home",
              });
              navigation.navigate("Register", {
                screen: "Register.Intro",
              });
              break;

            case ManageWalletOption.changeWallet:
              analyticsStore.logEvent("change_wallet_click", {
                pageName: "Home",
              });
              setChangeWalletModal(true);
              setIsOpenModal(false);
              break;

            case ManageWalletOption.renameWallet:
              analyticsStore.logEvent("rename_wallet_click", {
                pageName: "Home",
              });
              smartNavigation.navigateSmart("RenameWallet", {});
              setIsOpenModal(false);
              break;

            case ManageWalletOption.deleteWallet:
              analyticsStore.logEvent("delete_wallet_click", {
                pageName: "Home",
              });
              smartNavigation.navigateSmart("DeleteWallet", {});
              setIsOpenModal(false);
              break;
          }
        }}
      />
      <ChangeWalletCardModel
        isOpen={changeWalletModal}
        title="Change Wallet"
        keyRingStore={keyRingStore}
        close={() => setChangeWalletModal(false)}
        onChangeAccount={async (keyStore) => {
          const index = keyRingStore.multiKeyStoreInfo.indexOf(keyStore);
          if (index >= 0) {
            loadingScreen.setIsLoading(true);
            await keyRingStore.changeKeyRing(index);
            loadingScreen.setIsLoading(false);
            analyticsStore.logEvent("change_account_name_click", {
              pageName: "Home",
            });
          }
        }}
      />
      <CameraPermissionModal
        title={
          modelStatus == ModelStatus.First
            ? "Camera permission"
            : "Camera permission is disabled"
        }
        icon={
          modelStatus == ModelStatus.First ? (
            <CameraPermissionOffIcon />
          ) : (
            <CameraPermissionOnIcon />
          )
        }
        buttonText={
          modelStatus == ModelStatus.First
            ? "Allow Fetch to use camera"
            : "Enable camera permission in settings"
        }
        isOpen={openCameraModel}
        close={() => setIsOpenCameraModel(false)}
        onPress={async () => {
          const permissionStatus = await Camera.requestCameraPermissionsAsync();
          if (permissionStatus.status === PermissionStatus.DENIED) {
            if (permissionStatus.canAskAgain) {
              setIsOpenCameraModel(false);
            } else {
              await handleOpenSettings();
              setIsOpenCameraModel(false);
            }
          } else {
            setIsOpenCameraModel(false);
            if (permissionStatus.status === PermissionStatus.GRANTED) {
              smartNavigation.navigateSmart("Camera", {
                showMyQRButton: false,
              });
            }
          }
        }}
      />
      <TransactionModal
        isOpen={txnObj.txnStatusModal}
        close={() => {
          setTxnObj({ txnHash: "", txnStatusModal: false });
        }}
        txnHash={txnObj.txnHash}
        chainId={chainStore.current.chainId}
        buttonText="Go to activity screen"
        onHomeClick={() => navigation.navigate("ActivityTab", {})}
        onTryAgainClick={onSubmit}
      />
      <ClaimRewardsModal
        isOpen={showClaimModel}
        close={() => setClaimModel(false)}
        earnedAmount={`${numberLocalFormat(
          stakableReward.trim(true).shrink(true).toString().split(" ")[0]
        )} ${stakableReward.trim(true).shrink(true).toString().split(" ")[1]}`}
        onPress={onSubmit}
        buttonLoading={loadingClaimButton}
      />
    </View>
  );
});
