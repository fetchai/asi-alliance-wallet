import {
  Env,
  Handler,
  InternalHandler,
  KeplrError,
  Message,
} from "@keplr-wallet/router";
import { SendTxEthereumMsg, SendTxEthereumMsgAndRecordMsg } from "./messages";
import { BackgroundTxEthereumService } from "./service";
import { PermissionInteractiveService } from "../permission-interactive";

export const getHandler: (
  service: BackgroundTxEthereumService,
  permissionInteractionService: PermissionInteractiveService
) => Handler = (
  service: BackgroundTxEthereumService,
  permissionInteractionService: PermissionInteractiveService
) => {
  return (env: Env, msg: Message<unknown>) => {
    switch (msg.constructor) {
      case SendTxEthereumMsg:
        return handleSendTxEthereumMsg(service, permissionInteractionService)(
          env,
          msg as SendTxEthereumMsg
        );

      case SendTxEthereumMsgAndRecordMsg:
        return handleSendTxEthereumMsgAndRecordMsg(
          service,
          permissionInteractionService
        )(env, msg as SendTxEthereumMsgAndRecordMsg);

      default:
        throw new KeplrError("tx", 110, "Unknown msg type");
    }
  };
};

const handleSendTxEthereumMsg: (
  service: BackgroundTxEthereumService,
  permissionInteractionService: PermissionInteractiveService
) => InternalHandler<SendTxEthereumMsg> = (
  service,
  permissionInteractionService
) => {
  return async (env, msg) => {
    await permissionInteractionService.ensureEnabled(
      env,
      [msg.chainId],
      msg.origin
    );

    return await service.sendEthereumTx(msg.origin, msg.chainId, msg.tx, {
      silent: msg.silent,
    });
  };
};

const handleSendTxEthereumMsgAndRecordMsg: (
  service: BackgroundTxEthereumService,
  permissionInteractionService: PermissionInteractiveService
) => InternalHandler<SendTxEthereumMsgAndRecordMsg> = (
  service,
  permissionInteractionService
) => {
  return async (env, msg) => {
    await permissionInteractionService.ensureEnabled(
      env,
      [msg.chainId],
      msg.origin
    );

    return await service.sendEthereumTx(msg.origin, msg.chainId, msg.tx, {
      silent: msg.silent,
      onFulfill() {
        // noop
      },
    });
  };
};
