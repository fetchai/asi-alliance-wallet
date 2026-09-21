import { flowResult } from "mobx";
import { observable, reaction, runInAction } from "mobx";
import { PREFERRED_DEFAULT_CHAIN_ID } from "@keplr-wallet/background/cardano-chain-policy";
import { getCardanoChainRepairFallbackIfStale } from "./cardano-chain-repair";

/** Matches `KeyRingStatus.UNLOCKED` without importing heavy keyring module in Jest. */
const KEYRING_UNLOCKED = 3;

describe("getCardanoChainRepairFallbackIfStale", () => {
  it("returns preferred cosmos fallback when Cardano is selected with 12-word mnemonic", () => {
    const snap = { chainId: "cardano-preview", walletId: "w1" };
    const multi = [
      {
        selected: true,
        type: "mnemonic",
        meta: { __id__: "w1", mnemonicLength: "12" },
      },
    ];
    const fallback = getCardanoChainRepairFallbackIfStale(
      snap,
      multi as any,
      { features: ["cardano"] },
      [
        { chainId: "cardano-preview", features: ["cardano"] },
        { chainId: PREFERRED_DEFAULT_CHAIN_ID, features: ["cosmos"] },
      ]
    );
    expect(fallback).toBe(PREFERRED_DEFAULT_CHAIN_ID);
  });

  it("returns null when mnemonicLength is missing (aligns with walletShouldLeaveCardanoChain)", () => {
    const snap = { chainId: "cardano-preview", walletId: "w1" };
    const multi = [
      {
        selected: true,
        type: "mnemonic",
        meta: { __id__: "w1" },
      },
    ];
    expect(
      getCardanoChainRepairFallbackIfStale(
        snap,
        multi as any,
        { features: ["cardano"] },
        [
          { chainId: "cardano-preview", features: ["cardano"] },
          { chainId: PREFERRED_DEFAULT_CHAIN_ID, features: ["cosmos"] },
        ]
      )
    ).toBeNull();
  });
});

describe("Cardano chain repair startup trigger (reaction fireImmediately)", () => {
  it("runs repair once on subscribe when stale Cardano + incompatible wallet", async () => {
    const state = observable({
      status: KEYRING_UNLOCKED,
      selectedChainId: "cardano-preview",
      current: { features: ["cardano"] as string[] },
      chainInfos: [
        { chainId: "cardano-preview", features: ["cardano"] },
        { chainId: PREFERRED_DEFAULT_CHAIN_ID, features: ["cosmos"] },
      ],
      multiKeyStoreInfo: [
        {
          selected: true,
          type: "mnemonic",
          meta: { __id__: "w1", mnemonicLength: "12" },
        },
      ] as any,
    });

    const selectChainAndPersist = jest.fn(function* (chainId: string) {
      runInAction(() => {
        state.selectedChainId = chainId;
        state.current = {
          features: chainId.includes("cardano") ? ["cardano"] : ["cosmos"],
        };
      });
      yield undefined;
    });

    let inFlight = false;
    const disposer = reaction(
      () => {
        if (state.status !== KEYRING_UNLOCKED) {
          return null;
        }
        const selected = state.multiKeyStoreInfo.find(
          (k: { selected?: boolean }) => k.selected
        );
        if (!selected) {
          return null;
        }
        return {
          chainId: state.selectedChainId,
          walletId: String(
            (selected.meta as Record<string, string> | undefined)?.["__id__"] ??
              ""
          ),
        };
      },
      (snap) => {
        if (inFlight) {
          return;
        }
        const fallback = getCardanoChainRepairFallbackIfStale(
          snap ?? undefined,
          state.multiKeyStoreInfo,
          state.current,
          state.chainInfos
        );
        if (!fallback) {
          return;
        }
        inFlight = true;
        void (async () => {
          try {
            await flowResult(selectChainAndPersist(fallback));
          } finally {
            runInAction(() => {
              inFlight = false;
            });
          }
        })();
      },
      { fireImmediately: true }
    );

    await Promise.resolve();
    await flowResult(
      (function* waitTick() {
        yield Promise.resolve();
      })()
    );

    expect(selectChainAndPersist).toHaveBeenCalledTimes(1);
    expect(selectChainAndPersist).toHaveBeenCalledWith(
      PREFERRED_DEFAULT_CHAIN_ID
    );
    disposer();
  });
});
