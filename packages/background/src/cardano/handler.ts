import { Env, Handler, InternalHandler, Message } from "@keplr-wallet/router";
import { SendAdaMsg, GetCardanoBalanceMsg, IsCardanoReadyMsg } from "./messages";
import { CardanoService } from "./service";

export const getHandler: (service: CardanoService) => Handler = (
  service: CardanoService
) => {
  return (env: Env, msg: Message<unknown>) => {
    switch (msg.constructor) {
      case SendAdaMsg:
        return handleSendAdaMsg(service)(env, msg as SendAdaMsg);
      case GetCardanoBalanceMsg:
        return handleGetCardanoBalanceMsg(service)(env, msg as GetCardanoBalanceMsg);
      case IsCardanoReadyMsg:
        return handleIsCardanoReadyMsg(service)(env, msg as IsCardanoReadyMsg);
      default:
        throw new Error("Unknown msg type");
    }
  };
};

/**
 * Handler for sending ADA transaction
 */
const handleSendAdaMsg: (
  service: CardanoService
) => InternalHandler<SendAdaMsg> = (service) => {
  return async (_, msg) => {
    // Check that service is ready (analog to permission check in Keplr)
    if (!service.isReady()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }

    return await service.sendAda({
      to: msg.to,
      amount: msg.amount,
      memo: msg.memo
    });
  };
};

/**
 * Handler for getting Cardano balance
 */
const handleGetCardanoBalanceMsg: (
  service: CardanoService
) => InternalHandler<GetCardanoBalanceMsg> = (service) => {
  return async (_, _msg) => {
    // Check that service is ready
    if (!service.isReady()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }

    return await service.getBalance();
  };
};

/**
 * Handler for checking Cardano service readiness
 */
const handleIsCardanoReadyMsg: (
  service: CardanoService
) => InternalHandler<IsCardanoReadyMsg> = (service) => {
  return async (_, _msg) => {
    return service.isReady();
  };
};
