import { CardModal } from "modals/card";
import React, { FunctionComponent, useEffect, useState } from "react";
import { ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { IconWithText } from "components/new/icon-with-text/icon-with-text";
import { Button } from "components/button";
import { CosmosTxTracer } from "@keplr-wallet/stores";
import { Buffer } from "buffer";
import { useStore } from "stores/index";
import LottieView from "lottie-react-native";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";

enum TransactionStatus {
  Pending,
  Success,
  Failed,
}

interface TransactionProcess {
  status: TransactionStatus;
  title: string;
  subTitle: string;
  img: string;
}
export const TransactionModal: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  onTryAgainClick: () => void;
  onHomeClick: () => void;
  onViewDetailsClick?: () => void;
  onFailed?: (log: string) => void;
  txnHash: string;
  chainId: string;
  buttonText?: string;
}> = ({
  txnHash,
  chainId,
  isOpen,
  close,
  onHomeClick,
  onViewDetailsClick,
  onTryAgainClick,
  onFailed,
  buttonText = "Go to Homescreen",
}) => {
  const { chainStore } = useStore();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const [transactionState, setTransactionState] = useState<TransactionProcess>({
    status: TransactionStatus.Pending,
    title: "Transaction Pending",
    subTitle:
      "Transaction has been broadcasted to blockchain and pending confirmation",
    img: require("assets/lottie/pending.json"),
  });

  const style = useStyle();

  useEffect(() => {
    setTransactionState({
      status: TransactionStatus.Pending,
      title: "Transaction Pending",
      subTitle:
        "Transaction has been broadcasted to blockchain and pending confirmation",
      img: require("assets/lottie/pending.json"),
    });
    const chainInfo = chainStore.getChain(chainId);
    const txTracer: CosmosTxTracer = new CosmosTxTracer(
      chainInfo.rpc,
      "/websocket"
    );
    txTracer
      .traceTx(Buffer.from(txnHash, "hex") as Uint8Array)
      .then((tx) => {
        if (tx.code == null || tx.code === 0) {
          setTransactionState({
            status: TransactionStatus.Success,
            title: "Transaction Successful",
            subTitle:
              "Congratulations!\nYour transaction has been completed and confirmed by the blockchain",
            img: require("assets/lottie/success.json"),
          });
        } else {
          const log = tx.raw_log || tx.log || "";
          onFailed?.(log);
          setTransactionState({
            status: TransactionStatus.Failed,
            title: "Transaction Failed",
            subTitle: "Unfortunately your transaction has failed.",
            img: require("assets/lottie/failed.json"),
          });
        }
      })
      .catch((e) => {
        console.log(`Failed to trace the tx (${txnHash})`, e);
      });

    return () => {
      if (txTracer) {
        txTracer.close();
      }
    };
  }, [chainId, chainStore, txnHash]);

  const viewDetailsButton = (
    <Button
      text="View Details"
      mode="outline"
      size="large"
      containerStyle={
        style.flatten([
          "border-radius-64",
          "border-color-gray-100",
          "margin-top-12",
        ]) as ViewStyle
      }
      textStyle={style.flatten(["color-dark", "body2"]) as ViewStyle}
      onPress={() => {
        close();
        if (onViewDetailsClick) {
          onViewDetailsClick();
        } else {
          navigation.navigate("Others", {
            screen: "ActivityDetails",
            params: { id: txnHash.toUpperCase() },
          });
        }
      }}
    />
  );

  if (!isOpen) {
    return null;
  }

  return (
    <CardModal
      isOpen={isOpen}
      disableGesture={true}
      showCloseButton={true}
      close={() => {
        close();
        onHomeClick();
      }}
    >
      <IconWithText
        icon={
          <LottieView
            source={transactionState.img}
            autoPlay
            loop
            style={style.flatten(["width-90", "margin-bottom-16"]) as ViewStyle}
          />
        }
        title={transactionState.title}
        subtitle={transactionState.subTitle}
      >
        {transactionState.status === TransactionStatus.Failed ? (
          <Button
            text="Try Again"
            size="large"
            containerStyle={
              style.flatten([
                "border-radius-64",
                "background-color-dark",
                "margin-top-18",
              ]) as ViewStyle
            }
            textStyle={style.flatten(["color-white", "body2"]) as ViewStyle}
            onPress={() => {
              close();
              onTryAgainClick();
            }}
          />
        ) : null}
        {!!txnHash && transactionState.status === TransactionStatus.Failed
          ? viewDetailsButton
          : null}
        {transactionState.status === TransactionStatus.Failed ? (
          <Button
            text={buttonText}
            mode="outline"
            size="large"
            containerStyle={
              style.flatten([
                "border-radius-64",
                "border-color-gray-100",
                "margin-top-12",
              ]) as ViewStyle
            }
            textStyle={style.flatten(["body2", "color-dark"]) as ViewStyle}
            onPress={() => {
              close();
              onHomeClick();
            }}
          />
        ) : (
          <Button
            text={buttonText}
            size="large"
            containerStyle={
              style.flatten([
                "border-radius-64",
                "background-color-dark",
                "margin-top-12",
              ]) as ViewStyle
            }
            textStyle={style.flatten(["body2", "color-white"]) as ViewStyle}
            onPress={() => {
              close();
              onHomeClick();
            }}
          />
        )}
        {!!txnHash && transactionState.status === TransactionStatus.Success
          ? viewDetailsButton
          : null}
      </IconWithText>
    </CardModal>
  );
};
