import { Env, Handler, InternalHandler, Message } from "@keplr-wallet/router";
import {
  DecryptMessagingMessage,
  EncryptMessagingMessage,
  GetMessagingPublicKey,
  SignMessagingPayload,
} from "./messages";
import { MessagingService } from "./service";

export const getHandler: (service: MessagingService) => Handler = (service) => {
  return (env: Env, msg: Message<unknown>) => {
    switch (msg.constructor) {
      case GetMessagingPublicKey:
        return handleGetMessagingPublicKey(service)(
          env,
          msg as GetMessagingPublicKey
        );

      case EncryptMessagingMessage:
        return handleEncryptMessagingMessage(service)(
          env,
          msg as EncryptMessagingMessage
        );

      case DecryptMessagingMessage:
        return handleDecryptMessagingMessage(service)(
          env,
          msg as DecryptMessagingMessage
        );

      case SignMessagingPayload:
        return handleSignMessagingPayload(service)(
          env,
          msg as SignMessagingPayload
        );
      default:
        throw new Error("Unknown msg type");
    }
  };
};

const handleGetMessagingPublicKey: (
  service: MessagingService
) => InternalHandler<GetMessagingPublicKey> = (service) => {
  return async (env, msg) => {
    return await service.getPublicKey(env, msg.chainId);
  };
};

const handleEncryptMessagingMessage: (
  service: MessagingService
) => InternalHandler<EncryptMessagingMessage> = (service) => {
  return async (env, msg) => {
    return await service.encryptMessage(
      env,
      msg.chainId,
      msg.targetAddress,
      msg.message
    );
  };
};

const handleDecryptMessagingMessage: (
  service: MessagingService
) => InternalHandler<DecryptMessagingMessage> = (service) => {
  return async (env, msg) => {
    return await service.decryptMessage(env, msg.chainId, msg.cipherText);
  };
};

const handleSignMessagingPayload: (
  service: MessagingService
) => InternalHandler<SignMessagingPayload> = (service) => {
  return async (env, msg) => {
    return await service.sign(env, msg.chainId, msg.payload);
  };
};
