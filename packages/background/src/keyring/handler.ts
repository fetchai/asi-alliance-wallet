import { Env, Handler, InternalHandler, Message } from "@keplr-wallet/router";
import { walletSupportsCardano } from "./keyring";
import type { KeyStoreMetaKnown } from "./types";
import {
  CreateMnemonicKeyMsg,
  CreatePrivateKeyMsg,
  GetKeyMsg,
  UnlockKeyRingMsg,
  RequestSignAminoMsg,
  RequestSignDirectMsg,
  LockKeyRingMsg,
  DeleteKeyRingMsg,
  UpdateNameKeyRingMsg,
  ShowKeyRingMsg,
  AddMnemonicKeyMsg,
  AddPrivateKeyMsg,
  GetMultiKeyStoreInfoMsg,
  ChangeKeyRingMsg,
  AddLedgerKeyMsg,
  CreateLedgerKeyMsg,
  SetKeyStoreCoinTypeMsg,
  RestoreKeyRingMsg,
  GetIsKeyStoreCoinTypeSetMsg,
  CheckPasswordMsg,
  ExportKeyRingDatasMsg,
  RequestVerifyADR36AminoSignDoc,
  RequestSignEIP712CosmosTxMsg_v0,
  InitNonDefaultLedgerAppMsg,
  CreateKeystoneKeyMsg,
  AddKeystoneKeyMsg,
  RequestICNSAdr36SignaturesMsg,
  ChangeKeyRingNameMsg,
  StatusMsg,
  LockWalletMsg,
  UnlockWalletMsg,
  CurrentAccountMsg,
  RequestSignAminoMsgFetchSigning,
  RequestSignDirectMsgFetchSigning,
  RequestVerifyADR36AminoSignDocFetchSigning,
  SwitchAccountMsg,
  ListAccountsMsg,
  GetAccountMsg,
  RestoreWalletMsg,
  GetKeyMsgFetchSigning,
  RefreshAccountList,
  BroadcastKeyringSurfacesSyncMsg,
  UpdatePasswordMsg,
} from "./messages";
import { KeyRingService } from "./service";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { isValidCardanoAddress } from "@keplr-wallet/cardano";
import { SignDoc } from "@keplr-wallet/proto-types/cosmos/tx/v1beta1/tx";
import { KeyRingStatus } from "./keyring";
import { ExtensionKVStore } from "@keplr-wallet/common";
import { Account, WalletStatus } from "@fetchai/wallet-types";
import { formatErrorForLog } from "../logging/safe-error";

const isCardanoAddressCapableAlgo = (algo: string): boolean => {
  return algo === "ed25519" || algo === "cardano_address_only";
};

export const getHandler: (service: KeyRingService) => Handler = (
  service: KeyRingService
) => {
  return (env: Env, msg: Message<unknown>) => {
    const msgType = msg.type();
    switch (msgType) {
      case RestoreKeyRingMsg.type():
        return handleRestoreKeyRingMsg(service)(env, msg as RestoreKeyRingMsg);
      case DeleteKeyRingMsg.type():
        return handleDeleteKeyRingMsg(service)(env, msg as DeleteKeyRingMsg);
      case UpdateNameKeyRingMsg.type():
        return handleUpdateNameKeyRingMsg(service)(
          env,
          msg as UpdateNameKeyRingMsg
        );
      case ShowKeyRingMsg.type():
        return handleShowKeyRingMsg(service)(env, msg as ShowKeyRingMsg);
      case CreateMnemonicKeyMsg.type():
        return handleCreateMnemonicKeyMsg(service)(
          env,
          msg as CreateMnemonicKeyMsg
        );
      case AddMnemonicKeyMsg.type():
        return handleAddMnemonicKeyMsg(service)(env, msg as AddMnemonicKeyMsg);
      case CreatePrivateKeyMsg.type():
        return handleCreatePrivateKeyMsg(service)(
          env,
          msg as CreatePrivateKeyMsg
        );
      case AddPrivateKeyMsg.type():
        return handleAddPrivateKeyMsg(service)(env, msg as AddPrivateKeyMsg);
      case CreateKeystoneKeyMsg.type():
        return handleCreateKeystoneKeyMsg(service)(
          env,
          msg as CreateKeystoneKeyMsg
        );
      case CreateLedgerKeyMsg.type():
        return handleCreateLedgerKeyMsg(service)(
          env,
          msg as CreateLedgerKeyMsg
        );
      case AddKeystoneKeyMsg.type():
        return handleAddKeystoneKeyMsg(service)(env, msg as AddKeystoneKeyMsg);
      case AddLedgerKeyMsg.type():
        return handleAddLedgerKeyMsg(service)(env, msg as AddLedgerKeyMsg);
      case LockKeyRingMsg.type():
        return handleLockKeyRingMsg(service)(env, msg as LockKeyRingMsg);
      case UnlockKeyRingMsg.type():
        return handleUnlockKeyRingMsg(service)(env, msg as UnlockKeyRingMsg);
      case GetKeyMsg.type():
        return handleGetKeyMsg(service)(env, msg as GetKeyMsg);
      case GetAccountMsg.type():
        return handleGetAccountMsg(service)(env, msg as GetAccountMsg);
      case RequestSignAminoMsg.type():
        return handleRequestSignAminoMsg(service)(
          env,
          msg as RequestSignAminoMsg
        );
      case RequestSignEIP712CosmosTxMsg_v0.type():
        return handleRequestSignEIP712CosmosTxMsg_v0(service)(
          env,
          msg as RequestSignEIP712CosmosTxMsg_v0
        );
      case RequestVerifyADR36AminoSignDoc.type():
        return handleRequestVerifyADR36AminoSignDoc(service)(
          env,
          msg as RequestVerifyADR36AminoSignDoc
        );
      case RequestSignDirectMsg.type():
        return handleRequestSignDirectMsg(service)(
          env,
          msg as RequestSignDirectMsg
        );
      case RequestICNSAdr36SignaturesMsg.type():
        return handleRequestICNSAdr36SignaturesMsg(service)(
          env,
          msg as RequestICNSAdr36SignaturesMsg
        );
      case GetMultiKeyStoreInfoMsg.type():
        return handleGetMultiKeyStoreInfoMsg(service)(
          env,
          msg as GetMultiKeyStoreInfoMsg
        );
      case ChangeKeyRingMsg.type():
        return handleChangeKeyRingMsg(service)(env, msg as ChangeKeyRingMsg);
      case GetIsKeyStoreCoinTypeSetMsg.type():
        return handleGetIsKeyStoreCoinTypeSetMsg(service)(
          env,
          msg as GetIsKeyStoreCoinTypeSetMsg
        );
      case SetKeyStoreCoinTypeMsg.type():
        return handleSetKeyStoreCoinTypeMsg(service)(
          env,
          msg as SetKeyStoreCoinTypeMsg
        );
      case CheckPasswordMsg.type():
        return handleCheckPasswordMsg(service)(env, msg as CheckPasswordMsg);
      case UpdatePasswordMsg.type():
        return handleUpdatePasswordMsg(service)(env, msg as UpdatePasswordMsg);
      case ExportKeyRingDatasMsg.type():
        return handleExportKeyRingDatasMsg(service)(
          env,
          msg as ExportKeyRingDatasMsg
        );
      case UpdatePasswordMsg.type():
        return handleUpdatePasswordMsg(service)(env, msg as UpdatePasswordMsg);
      case InitNonDefaultLedgerAppMsg.type():
        return handleInitNonDefaultLedgerAppMsg(service)(
          env,
          msg as InitNonDefaultLedgerAppMsg
        );
      case ChangeKeyRingNameMsg.type():
        return handleChangeKeyNameMsg(service)(
          env,
          msg as ChangeKeyRingNameMsg
        );
      case StatusMsg.type():
        return handleStatusMsg(service)(env, msg as StatusMsg);
      case RestoreWalletMsg.type():
        return handleRestoreWalletMsg(service)(env, msg as StatusMsg);
      case LockWalletMsg.type():
        return handleLockWallet(service)(env, msg as LockWalletMsg);
      case UnlockWalletMsg.type():
        return handleUnlockWallet(service)(env, msg as UnlockWalletMsg);
      case CurrentAccountMsg.type():
        return handleCurrentAccountMsg(service)(env, msg as CurrentAccountMsg);
      case SwitchAccountMsg.type():
        return handleSwitchAccountMsg(service)(env, msg as SwitchAccountMsg);
      case ListAccountsMsg.type():
        return handleListAccountsMsg(service)(env, msg as ListAccountsMsg);
      case GetKeyMsgFetchSigning.type():
        return handleGetKeyMsgFetchSigning(service)(
          env,
          msg as GetKeyMsgFetchSigning
        );
      case RequestSignAminoMsgFetchSigning.type():
        return handleRequestSignAminoMsgFetchSigning(service)(
          env,
          msg as RequestSignAminoMsgFetchSigning
        );
      case RequestSignDirectMsgFetchSigning.type():
        return handleRequestSignDirectMsgFetchSigning(service)(
          env,
          msg as RequestSignDirectMsgFetchSigning
        );
      case RequestVerifyADR36AminoSignDocFetchSigning.type():
        return handleRequestVerifyADR36AminoSignDocFetchSigning(service)(
          env,
          msg as RequestVerifyADR36AminoSignDocFetchSigning
        );
      case RefreshAccountList.type():
        return handleRefreshAccountListMsg(service)(
          env,
          msg as RefreshAccountList
        );
      case BroadcastKeyringSurfacesSyncMsg.type():
        return handleBroadcastKeyringSurfacesSyncMsg(service)(
          env,
          msg as BroadcastKeyringSurfacesSyncMsg
        );
      default:
        throw new Error("Unknown msg type");
    }
  };
};

const handleRestoreKeyRingMsg: (
  service: KeyRingService
) => InternalHandler<RestoreKeyRingMsg> = (service) => {
  return async (_env, _msg) => {
    return await service.restore();
  };
};

// RefreshAccountList does not need to do anything in the background
const handleRefreshAccountListMsg: (
  service: KeyRingService
) => InternalHandler<RefreshAccountList> = (_service) => {
  return async (_env, _msg) => {
    return true;
  };
};

const handleBroadcastKeyringSurfacesSyncMsg: (
  service: KeyRingService
) => InternalHandler<BroadcastKeyringSurfacesSyncMsg> = (service) => {
  return async (_env, _msg) => {
    service.broadcastKeyringSurfacesSync();
    return true;
  };
};

const handleDeleteKeyRingMsg: (
  service: KeyRingService
) => InternalHandler<DeleteKeyRingMsg> = (service) => {
  return async (_, msg) => {
    return await service.deleteKeyRing(msg.index, msg.password);
  };
};

const handleUpdateNameKeyRingMsg: (
  service: KeyRingService
) => InternalHandler<UpdateNameKeyRingMsg> = (service) => {
  return async (_, msg) => {
    return await service.updateNameKeyRing(
      msg.index,
      msg.name,
      msg.nameByChain
    );
  };
};

const handleShowKeyRingMsg: (
  service: KeyRingService
) => InternalHandler<ShowKeyRingMsg> = (service) => {
  return async (_, msg) => {
    return await service.showKeyRing(msg.index, msg.password);
  };
};

const handleCreateMnemonicKeyMsg: (
  service: KeyRingService
) => InternalHandler<CreateMnemonicKeyMsg> = (service) => {
  return async (_, msg) => {
    return await service.createMnemonicKey(
      msg.kdf,
      msg.mnemonic,
      msg.password,
      msg.meta,
      msg.bip44HDPath
    );
  };
};

const handleAddMnemonicKeyMsg: (
  service: KeyRingService
) => InternalHandler<AddMnemonicKeyMsg> = (service) => {
  return async (_, msg) => {
    return await service.addMnemonicKey(
      msg.kdf,
      msg.mnemonic,
      msg.meta,
      msg.bip44HDPath
    );
  };
};

const handleCreatePrivateKeyMsg: (
  service: KeyRingService
) => InternalHandler<CreatePrivateKeyMsg> = (service) => {
  return async (_, msg) => {
    return await service.createPrivateKey(
      msg.kdf,
      msg.privateKey,
      msg.password,
      msg.meta
    );
  };
};

const handleAddPrivateKeyMsg: (
  service: KeyRingService
) => InternalHandler<AddPrivateKeyMsg> = (service) => {
  return async (_, msg) => {
    return await service.addPrivateKey(msg.kdf, msg.privateKey, msg.meta);
  };
};

const handleCreateKeystoneKeyMsg: (
  service: KeyRingService
) => InternalHandler<CreateKeystoneKeyMsg> = (service) => {
  return async (env, msg) => {
    return await service.createKeystoneKey(
      env,
      msg.kdf,
      msg.password,
      msg.meta,
      msg.bip44HDPath
    );
  };
};

const handleCreateLedgerKeyMsg: (
  service: KeyRingService
) => InternalHandler<CreateLedgerKeyMsg> = (service) => {
  return async (env, msg) => {
    return await service.createLedgerKey(
      env,
      msg.kdf,
      msg.password,
      msg.meta,
      msg.bip44HDPath,
      msg.cosmosLikeApp
    );
  };
};

const handleAddKeystoneKeyMsg: (
  service: KeyRingService
) => InternalHandler<AddKeystoneKeyMsg> = (service) => {
  return async (env, msg) => {
    return await service.addKeystoneKey(
      env,
      msg.kdf,
      msg.meta,
      msg.bip44HDPath
    );
  };
};

const handleAddLedgerKeyMsg: (
  service: KeyRingService
) => InternalHandler<AddLedgerKeyMsg> = (service) => {
  return async (env, msg) => {
    return await service.addLedgerKey(
      env,
      msg.kdf,
      msg.meta,
      msg.bip44HDPath,
      msg.cosmosLikeApp
    );
  };
};

const handleLockKeyRingMsg: (
  service: KeyRingService
) => InternalHandler<LockKeyRingMsg> = (service) => {
  const status = service.lock();
  return () => {
    return {
      status,
    };
  };
};

const handleUnlockKeyRingMsg: (
  service: KeyRingService
) => InternalHandler<UnlockKeyRingMsg> = (service) => {
  return async (_, msg) => {
    const status = await service.unlock(msg.password);
    return {
      status,
    };
  };
};

const handleGetKeyMsg: (
  service: KeyRingService
) => InternalHandler<GetKeyMsg> = (service) => {
  return async (env, msg) => {
    const status = service.keyRingStatus;

    if (status === KeyRingStatus.EMPTY) {
      throw new Error("No keys available. Please create a wallet first.");
    }

    if (status === KeyRingStatus.LOCKED) {
      throw new Error("Keyring is locked. Please unlock first.");
    }

    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      msg.chainId,
      msg.origin
    );

    const key = await service.getKey(msg.chainId);

    let nameByChain;

    try {
      nameByChain = JSON.parse(service.getKeyStoreMeta("nameByChain"));
    } catch {
      nameByChain = {};
    }

    const chainInfo = await service.chainsService.getChainInfo(msg.chainId);
    let bech32Address: string;
    if (chainInfo.features?.includes("cardano")) {
      bech32Address = Buffer.from(key.address).toString("utf8");
    } else {
      bech32Address = new Bech32Address(key.address).toBech32(
        chainInfo.bech32Config.bech32PrefixAccAddr
      );
    }

    return {
      name: nameByChain?.[msg.chainId] || service.getKeyStoreMeta("name"),
      algo: key.algo || "secp256k1",
      pubKey: key.pubKey,
      address: key.address,
      bech32Address: bech32Address,
      isNanoLedger: key.isNanoLedger,
      isKeystone: key.isKeystone,
    };
  };
};

const handleRequestSignAminoMsg: (
  service: KeyRingService
) => InternalHandler<RequestSignAminoMsg> = (service) => {
  return async (env, msg) => {
    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      msg.chainId,
      msg.origin
    );

    return await service.requestSignAmino(
      env,
      msg.origin,
      msg.chainId,
      msg.signer,
      msg.signDoc,
      msg.signOptions
    );
  };
};

const handleRequestSignEIP712CosmosTxMsg_v0: (
  service: KeyRingService
) => InternalHandler<RequestSignEIP712CosmosTxMsg_v0> = (service) => {
  return async (env, msg) => {
    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      msg.chainId,
      msg.origin
    );

    return await service.requestSignEIP712CosmosTx_v0(
      env,
      msg.origin,
      msg.chainId,
      msg.signer,
      msg.eip712,
      msg.signDoc,
      msg.signOptions
    );
  };
};

const handleRequestVerifyADR36AminoSignDoc: (
  service: KeyRingService
) => InternalHandler<RequestVerifyADR36AminoSignDoc> = (service) => {
  return async (env, msg) => {
    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      msg.chainId,
      msg.origin
    );

    return await service.verifyADR36AminoSignDoc(
      msg.chainId,
      msg.signer,
      msg.data,
      msg.signature
    );
  };
};

const handleRequestSignDirectMsg: (
  service: KeyRingService
) => InternalHandler<RequestSignDirectMsg> = (service) => {
  return async (env, msg) => {
    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      msg.chainId,
      msg.origin
    );

    const signDoc = SignDoc.fromPartial({
      bodyBytes: msg.signDoc.bodyBytes,
      authInfoBytes: msg.signDoc.authInfoBytes,
      chainId: msg.signDoc.chainId,
      accountNumber: msg.signDoc.accountNumber,
    });

    const response = await service.requestSignDirect(
      env,
      msg.origin,
      msg.chainId,
      msg.signer,
      signDoc,
      msg.signOptions
    );

    return {
      signed: {
        bodyBytes: response.signed.bodyBytes,
        authInfoBytes: response.signed.authInfoBytes,
        chainId: response.signed.chainId,
        accountNumber: response.signed.accountNumber.toString(),
      },
      signature: response.signature,
    };
  };
};

const handleRequestICNSAdr36SignaturesMsg: (
  service: KeyRingService
) => InternalHandler<RequestICNSAdr36SignaturesMsg> = (service) => {
  return async (env, msg) => {
    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      msg.chainId,
      msg.origin
    );

    return service.requestICNSAdr36Signatures(
      env,
      msg.chainId,
      msg.contractAddress,
      msg.owner,
      msg.username,
      msg.addressChainIds
    );
  };
};

const handleGetMultiKeyStoreInfoMsg: (
  service: KeyRingService
) => InternalHandler<GetMultiKeyStoreInfoMsg> = (service) => {
  return async () => {
    if (service.keyRingStatus === KeyRingStatus.NOTLOADED) {
      await service.restore();
    }

    return {
      status: service.keyRingStatus,
      multiKeyStoreInfo: service.getMultiKeyStoreInfo(),
    };
  };
};

const handleChangeKeyRingMsg: (
  service: KeyRingService
) => InternalHandler<ChangeKeyRingMsg> = (service) => {
  return async (_, msg) => {
    return await service.changeKeyStoreFromMultiKeyStore(msg.index);
  };
};

const handleGetIsKeyStoreCoinTypeSetMsg: (
  service: KeyRingService
) => InternalHandler<GetIsKeyStoreCoinTypeSetMsg> = (service) => {
  return (_, msg) => {
    return service.getKeyStoreBIP44Selectables(msg.chainId, msg.paths);
  };
};

const handleSetKeyStoreCoinTypeMsg: (
  service: KeyRingService
) => InternalHandler<SetKeyStoreCoinTypeMsg> = (service) => {
  return async (_, msg) => {
    await service.setKeyStoreCoinType(msg.chainId, msg.coinType);
    return service.keyRingStatus;
  };
};

const handleCheckPasswordMsg: (
  service: KeyRingService
) => InternalHandler<CheckPasswordMsg> = (service) => {
  return (_, msg) => {
    return service.checkPassword(msg.password);
  };
};

const handleUpdatePasswordMsg: (
  service: KeyRingService
) => InternalHandler<UpdatePasswordMsg> = (service) => {
  return async (_, msg) => {
    return await service.updatePassword(msg.oldPassword, msg.newPassword);
  };
};

const handleExportKeyRingDatasMsg: (
  service: KeyRingService
) => InternalHandler<ExportKeyRingDatasMsg> = (service) => {
  return async (_, msg) => {
    return await service.exportKeyRingDatas(msg.password);
  };
};

const handleInitNonDefaultLedgerAppMsg: (
  service: KeyRingService
) => InternalHandler<InitNonDefaultLedgerAppMsg> = (service) => {
  return async (env, msg) => {
    await service.initializeNonDefaultLedgerApp(env, msg.ledgerApp);
  };
};

const handleChangeKeyNameMsg: (
  service: KeyRingService
) => InternalHandler<ChangeKeyRingNameMsg> = (service) => {
  return async (env, msg) => {
    // Ensure that keyring is unlocked and selected.
    // Don't call enable() if wallet is empty or status is undefined to avoid "key doesn't exist" errors
    if (
      service.keyRingStatus !== KeyRingStatus.EMPTY &&
      service.keyRingStatus !== undefined
    ) {
      await service.enable(env);
    }

    let index = -1;
    service.getMultiKeyStoreInfo().forEach(({ selected }, idx) => {
      if (selected) {
        index = idx;
      }
    });

    if (index === -1) {
      throw new Error("No account selected");
    }

    return await service.changeKeyRingName(env, index, {
      defaultName: msg.defaultName,
      editable: msg.editable,
    });
  };
};

const handleRestoreWalletMsg: (
  service: KeyRingService
) => InternalHandler<RestoreWalletMsg> = (service) => {
  return async () => {
    const { status } = await service.restore();
    if (status === KeyRingStatus.EMPTY) {
      return WalletStatus.EMPTY;
    } else if (status === KeyRingStatus.LOCKED) {
      return WalletStatus.LOCKED;
    } else if (status === KeyRingStatus.NOTLOADED) {
      return WalletStatus.NOTLOADED;
    } else if (status === KeyRingStatus.UNLOCKED) {
      return WalletStatus.UNLOCKED;
    } else return WalletStatus.NOTLOADED;
  };
};

const handleStatusMsg: (
  service: KeyRingService
) => InternalHandler<StatusMsg> = (service) => {
  return () => {
    const status = service.keyRingStatus;
    if (status === KeyRingStatus.EMPTY) {
      return WalletStatus.EMPTY;
    } else if (status === KeyRingStatus.LOCKED) {
      return WalletStatus.LOCKED;
    } else if (status === KeyRingStatus.NOTLOADED) {
      return WalletStatus.NOTLOADED;
    } else if (status === KeyRingStatus.UNLOCKED) {
      return WalletStatus.UNLOCKED;
    } else return WalletStatus.NOTLOADED;
  };
};

const handleLockWallet: (
  service: KeyRingService
) => InternalHandler<LockWalletMsg> = (service) => {
  return () => {
    service.lock();
  };
};

const handleUnlockWallet: (
  service: KeyRingService
) => InternalHandler<UnlockWalletMsg> = (service) => {
  return async (env, _) => {
    // Don't call enable() if wallet is empty or status is undefined to avoid "key doesn't exist" errors
    if (
      service.keyRingStatus !== KeyRingStatus.EMPTY &&
      service.keyRingStatus !== undefined
    ) {
      await service.enable(env);
    }
  };
};

const handleCurrentAccountMsg: (
  service: KeyRingService
) => InternalHandler<CurrentAccountMsg> = (service) => {
  return async (env, msg) => {
    const chainId = await service.chainsService.getSelectedChain();
    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      [chainId],
      msg.origin
    );

    const key = await service.getKey(chainId);

    const chainInfo = await service.chainsService.getChainInfo(chainId);
    const isEVM = chainInfo.features?.includes("evm");
    const isCardano = chainInfo.features?.includes("cardano");
    const bech32Add = isCardano
      ? isCardanoAddressCapableAlgo(key.algo)
        ? Buffer.from(key.address).toString("utf8")
        : ""
      : new Bech32Address(key.address).toBech32(
          chainInfo.bech32Config.bech32PrefixAccAddr
        );

    const hexadd =
      isEVM && bech32Add
        ? Bech32Address.fromBech32(
            bech32Add,
            chainInfo.bech32Config.bech32PrefixAccAddr
          ).toHex(true)
        : "";

    const acc: Account = {
      name: service.getKeyStoreMeta("name"),
      algo: key.algo,
      pubKey: key.pubKey,
      address: key.address,
      bech32Address: isEVM ? "" : bech32Add,
      isNanoLedger: key.isNanoLedger,
      isKeystone: key.isKeystone,
      EVMAddress: isEVM ? hexadd : "",
    };
    return acc;
  };
};

const handleSwitchAccountMsg: (
  service: KeyRingService
) => InternalHandler<SwitchAccountMsg> = (service) => {
  return async (env, msg) => {
    const chainId = await service.chainsService.getSelectedChain();
    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      [chainId],
      msg.origin
    );

    await service.switchAccountByAddress(env, msg.address, msg.origin);
  };
};

const handleListAccountsMsg: (
  service: KeyRingService
) => InternalHandler<ListAccountsMsg> = (service) => {
  return async (env, msg) => {
    const chainId = await service.chainsService.getSelectedChain();

    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      [chainId],
      msg.origin
    );

    const chainInfo = await service.chainsService.getChainInfo(chainId);
    const isEVM = chainInfo.features?.includes("evm");
    const isCardano = chainInfo.features?.includes("cardano");

    // First ListAccounts for a new Cardano chain may block here until restore/init completes,
    // because network-changed is dispatched before onNetworkSwitch handlers finish.
    if (isCardano) {
      try {
        await service.ensureCardanoServiceReady(chainId);
      } catch (error) {
        console.error(
          "[KeyRingService] ensureCardanoServiceReady failed in ListAccountsMsg:",
          formatErrorForLog(error, { chainId, source: "ListAccountsMsg" })
        );
        return {
          accounts: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const walletInfos = service.getKeyRing().getMultiKeyStoreInfo();
    const walletIds = walletInfos.map(
      (w) => (w.meta as KeyStoreMetaKnown)?.["__id__"] || ""
    );
    const walletNames = walletInfos.map((w) => {
      const meta = w.meta as KeyStoreMetaKnown;
      if (!meta) return "Unnamed Account";
      try {
        const nameByChain = meta["nameByChain"]
          ? JSON.parse(meta["nameByChain"])
          : {};
        return nameByChain?.[chainId] || meta["name"] || "Unnamed Account";
      } catch {
        return meta["name"] || "Unnamed Account";
      }
    });

    const tryBuildFromCache = async (): Promise<Account[] | null> => {
      try {
        if (walletIds.some((id) => !id)) return null;

        if (isCardano) {
          const cache = await service
            .getKeyRing()
            .loadCardanoChainCache(chainId);

          const supportedFlags = walletInfos.map((w) => {
            const meta = w.meta as KeyStoreMetaKnown;
            if (meta?.["cardano"] === "true") return true;
            return walletSupportsCardano(w);
          });

          const hasAll = walletIds.every((id, idx) => {
            if (!supportedFlags[idx]) return true;
            const entry = cache[id];
            return Boolean(
              entry?.address && isValidCardanoAddress(entry.address)
            );
          });

          if (!hasAll) return null;

          return walletIds.map((id, idx) => {
            const entry = cache[id];
            const address = entry?.address || "";
            const pubKey = entry?.pubKey || "";
            const isSupported = supportedFlags[idx];
            const keyStoreType = walletInfos[idx]?.type;
            const addressBytes = isSupported
              ? Buffer.from(address, "utf8")
              : new Uint8Array(0);
            const isHexPubKey =
              /^[0-9a-fA-F]+$/.test(pubKey) && pubKey.length % 2 === 0;
            const pubKeyBytes = isSupported
              ? pubKey
                ? Buffer.from(pubKey, isHexPubKey ? "hex" : "utf8")
                : new Uint8Array(0)
              : new Uint8Array(0);

            return {
              name: walletNames[idx],
              algo: isSupported
                ? "cardano_address_only"
                : "cardano_unsupported",
              pubKey: pubKeyBytes,
              address: addressBytes,
              bech32Address: address,
              isNanoLedger: keyStoreType === "ledger",
              isKeystone: keyStoreType === "keystone",
              EVMAddress: "",
            };
          });
        }

        const cache = await service.getKeyRing().loadGenericChainCache(chainId);
        const hasAll = walletIds.every((id) => Boolean(cache[id]?.address));
        if (!hasAll) return null;

        return walletIds.map((id, idx) => {
          const entry = cache[id];
          const addressHex = entry?.address || "";
          const pubKeyHex = entry?.pubKey || "";
          const keyStoreType = walletInfos[idx]?.type;
          let bech32Add = "";

          try {
            if (addressHex) {
              bech32Add = new Bech32Address(
                Buffer.from(addressHex, "hex")
              ).toBech32(chainInfo.bech32Config.bech32PrefixAccAddr);
            }
          } catch {
            bech32Add = "";
          }

          return {
            name: entry?.name || walletNames[idx],
            algo: "secp256k1",
            pubKey: pubKeyHex
              ? Buffer.from(pubKeyHex, "hex")
              : new Uint8Array(0),
            address: addressHex
              ? Buffer.from(addressHex, "hex")
              : new Uint8Array(0),
            bech32Address: isEVM ? "" : bech32Add,
            isNanoLedger: keyStoreType === "ledger",
            isKeystone: keyStoreType === "keystone",
            EVMAddress:
              isEVM && bech32Add
                ? Bech32Address.fromBech32(
                    bech32Add,
                    chainInfo.bech32Config.bech32PrefixAccAddr
                  ).toHex(true)
                : "",
          };
        });
      } catch {
        return null;
      }
    };

    const cachedAccounts = await tryBuildFromCache();
    if (cachedAccounts) {
      return { accounts: cachedAccounts };
    }

    const keys = await service.getKeys(chainId);

    const returnData: Account[] = [];

    keys.forEach((key, _idx) => {
      let bech32Add: string;
      if (isCardano) {
        if (isCardanoAddressCapableAlgo(key.algo)) {
          bech32Add = Buffer.from(key.address).toString("utf8");
        } else {
          bech32Add = "";
        }
      } else {
        bech32Add = new Bech32Address(key.address).toBech32(
          chainInfo.bech32Config.bech32PrefixAccAddr
        );
      }

      returnData.push({
        name: key.name,
        algo: key.algo,
        pubKey: key.pubKey,
        address: key.address,
        bech32Address: isEVM ? "" : bech32Add,
        isNanoLedger: key.isNanoLedger,
        isKeystone: key.isKeystone,
        EVMAddress: isEVM
          ? Bech32Address.fromBech32(
              bech32Add,
              chainInfo.bech32Config.bech32PrefixAccAddr
            ).toHex(true)
          : "",
      });
    });

    return { accounts: returnData };
  };
};

const handleRequestSignAminoMsgFetchSigning: (
  service: KeyRingService
) => InternalHandler<RequestSignAminoMsgFetchSigning> = (service) => {
  return async (env, msg) => {
    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      [msg.chainId],
      msg.origin
    );

    return await service.requestSignAmino(
      env,
      msg.origin,
      msg.chainId,
      msg.signer,
      msg.signDoc,
      msg.signOptions
    );
  };
};

const handleRequestSignDirectMsgFetchSigning: (
  service: KeyRingService
) => InternalHandler<RequestSignDirectMsgFetchSigning> = (service) => {
  return async (env, msg) => {
    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      [msg.chainId],
      msg.origin
    );

    const signDoc = SignDoc.fromPartial({
      bodyBytes:
        msg.signDoc.bodyBytes === null ? undefined : msg.signDoc.bodyBytes,
      authInfoBytes:
        msg.signDoc.authInfoBytes === null
          ? undefined
          : msg.signDoc.authInfoBytes,
      chainId: msg.signDoc.chainId === null ? undefined : msg.signDoc.chainId,
      accountNumber:
        msg.signDoc.accountNumber === null
          ? undefined
          : msg.signDoc.accountNumber,
    });

    const response = await service.requestSignDirect(
      env,
      msg.origin,
      msg.chainId,
      msg.signer,
      signDoc,
      msg.signOptions
    );

    return {
      signed: {
        bodyBytes: response.signed.bodyBytes,
        authInfoBytes: response.signed.authInfoBytes,
        chainId: response.signed.chainId,
        accountNumber: response.signed.accountNumber.toString(),
      },
      signature: response.signature,
    };
  };
};

const handleRequestVerifyADR36AminoSignDocFetchSigning: (
  service: KeyRingService
) => InternalHandler<RequestVerifyADR36AminoSignDocFetchSigning> = (
  service
) => {
  return async (env, msg) => {
    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      [msg.chainId],
      msg.origin
    );

    return await service.verifyADR36AminoSignDoc(
      msg.chainId,
      msg.signer,
      msg.data,
      msg.signature
    );
  };
};

const handleGetAccountMsg: (
  service: KeyRingService
) => InternalHandler<GetAccountMsg> = (service) => {
  return async (env, msg) => {
    const kvStore = new ExtensionKVStore("store_chain_config");
    const chainId = await kvStore.get<string>("extension_last_view_chain_id");
    if (!chainId) {
      throw Error("could not detect current chainId");
    }

    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      [chainId],
      msg.origin
    );

    const keys = await service.getKeys(chainId);

    const chainInfo = await service.chainsService.getChainInfo(chainId);
    const isEVM = chainInfo.features?.includes("evm");
    const isCardano = chainInfo.features?.includes("cardano");
    let foundAccount: Account | null = null;
    keys.forEach((key) => {
      const bech32Add = isCardano
        ? isCardanoAddressCapableAlgo(key.algo)
          ? Buffer.from(key.address).toString("utf8")
          : ""
        : new Bech32Address(key.address).toBech32(
            chainInfo.bech32Config.bech32PrefixAccAddr
          );
      const hexAdd =
        isEVM && bech32Add
          ? Bech32Address.fromBech32(
              bech32Add,
              chainInfo.bech32Config.bech32PrefixAccAddr
            ).toHex(true)
          : "";
      if (msg.address === bech32Add || msg.address === hexAdd) {
        foundAccount = {
          name: key.name,
          algo: key.algo,
          pubKey: key.pubKey,
          address: key.address,
          bech32Address: isEVM ? "" : bech32Add,
          isNanoLedger: key.isNanoLedger,
          isKeystone: key.isKeystone,
          EVMAddress: isEVM ? hexAdd : "",
        } as Account;
      }
    });
    return foundAccount;
  };
};

const handleGetKeyMsgFetchSigning: (
  service: KeyRingService
) => InternalHandler<GetKeyMsgFetchSigning> = (service) => {
  return async (env, msg) => {
    const status = await service.checkReadiness(env);

    if (status === KeyRingStatus.EMPTY) {
      throw new Error("No keys available. Please create a wallet first.");
    }

    const chainId = await service.chainsService.getSelectedChain();
    await service.permissionService.checkOrGrantBasicAccessPermission(
      env,
      [chainId],
      msg.origin
    );

    const key = await service.getKey(chainId);

    const chainInfo = await service.chainsService.getChainInfo(chainId);
    const isEVM = chainInfo.features?.includes("evm");
    const isCardano = chainInfo.features?.includes("cardano");
    const bech32Add = isCardano
      ? isCardanoAddressCapableAlgo(key.algo)
        ? Buffer.from(key.address).toString("utf8")
        : ""
      : new Bech32Address(key.address).toBech32(
          chainInfo.bech32Config.bech32PrefixAccAddr
        );

    const hexadd =
      isEVM && bech32Add
        ? Bech32Address.fromBech32(
            bech32Add,
            chainInfo.bech32Config.bech32PrefixAccAddr
          ).toHex(true)
        : "";

    const acc: Account = {
      name: service.getKeyStoreMeta("name"),
      algo: key.algo,
      pubKey: key.pubKey,
      address: key.address,
      bech32Address: isEVM ? "" : bech32Add,
      isNanoLedger: key.isNanoLedger,
      isKeystone: key.isKeystone,
      EVMAddress: isEVM ? hexadd : "",
    };
    return acc;
  };
};
