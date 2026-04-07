import { PREFERRED_DEFAULT_CHAIN_ID } from "@keplr-wallet/background/cardano-chain-policy";
import {
  ensureChainCompatibleBeforeSelectKeyStore,
  ensureCompatibleChainForUpcomingWallet,
} from "./cardano-awaitable-alignment";

describe("ensureCompatibleChainForUpcomingWallet", () => {
  it("selects non-Cardano fallback before changeKeyRing when on Cardano and wallet is not Cardano-capable", async () => {
    const selectChainAndPersist = jest.fn(function* selectChain(id: string) {
      void id;
      yield undefined;
    });
    await ensureCompatibleChainForUpcomingWallet(
      {
        current: { features: ["cardano"] },
        chainInfos: [
          { chainId: "cardano-preview", features: ["cardano"] },
          { chainId: PREFERRED_DEFAULT_CHAIN_ID, features: ["cosmos"] },
        ],
        selectChainAndPersist,
      },
      { supportsCardano: false }
    );
    expect(selectChainAndPersist).toHaveBeenCalledTimes(1);
    expect(selectChainAndPersist).toHaveBeenCalledWith(
      PREFERRED_DEFAULT_CHAIN_ID
    );
  });

  it("does not switch chain when upcoming wallet supports Cardano", async () => {
    const selectChainAndPersist = jest.fn(function* () {
      yield undefined;
    });
    await ensureCompatibleChainForUpcomingWallet(
      {
        current: { features: ["cardano"] },
        chainInfos: [
          { chainId: "cardano-preview", features: ["cardano"] },
          { chainId: PREFERRED_DEFAULT_CHAIN_ID, features: ["cosmos"] },
        ],
        selectChainAndPersist,
      },
      { supportsCardano: true }
    );
    expect(selectChainAndPersist).not.toHaveBeenCalled();
  });
});

describe("ensureChainCompatibleBeforeSelectKeyStore", () => {
  it("switches to fallback when on Cardano and target keystore must leave Cardano (12-word mnemonic)", async () => {
    const selectChainAndPersist = jest.fn(function* (id: string) {
      void id;
      yield undefined;
    });
    await ensureChainCompatibleBeforeSelectKeyStore(
      {
        current: { features: ["cardano"] },
        chainInfos: [
          { chainId: "cardano-preview", features: ["cardano"] },
          { chainId: PREFERRED_DEFAULT_CHAIN_ID, features: ["cosmos"] },
        ],
        selectChainAndPersist,
      },
      {
        type: "mnemonic",
        meta: { mnemonicLength: "12" },
      }
    );
    expect(selectChainAndPersist).toHaveBeenCalledTimes(1);
    expect(selectChainAndPersist).toHaveBeenCalledWith(
      PREFERRED_DEFAULT_CHAIN_ID
    );
  });

  it("does nothing when target keystore supports Cardano (24-word)", async () => {
    const selectChainAndPersist = jest.fn(function* () {
      yield undefined;
    });
    await ensureChainCompatibleBeforeSelectKeyStore(
      {
        current: { features: ["cardano"] },
        chainInfos: [
          { chainId: "cardano-preview", features: ["cardano"] },
          { chainId: PREFERRED_DEFAULT_CHAIN_ID, features: ["cosmos"] },
        ],
        selectChainAndPersist,
      },
      {
        type: "mnemonic",
        meta: { mnemonicLength: "24" },
      }
    );
    expect(selectChainAndPersist).not.toHaveBeenCalled();
  });
});
