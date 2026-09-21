/**
 * Blockfrost input resolver
 * Adapted from lace/packages/cardano/src/wallet/lib/blockfrost-input-resolver.ts
 * Simplified version for basic transaction functionality
 */

import { Cardano } from "@cardano-sdk/core";
import {
  BlockfrostClient,
  BlockfrostToCore,
} from "@cardano-sdk/cardano-services-client";
import type { Cache } from "@cardano-sdk/util";
import { Logger } from "ts-log";

const NOT_FOUND_STATUS = 404;

/**
 * Converts a Cardano.TxIn object to a unique UTXO ID.
 */
const txInToId = (txIn: Cardano.TxIn): string => `${txIn.txId}#${txIn.index}`;

type BlockfrostInputResolverDependencies = {
  cache?: Cache<Cardano.TxOut>;
  client: BlockfrostClient;
  logger: Logger;
};

/**
 * Simplified BlockfrostInputResolver implementation
 * For full functionality, see lace implementation
 */
export class BlockfrostInputResolver implements Cardano.InputResolver {
  readonly #logger: Logger;
  readonly #client: BlockfrostClient;
  readonly #txCache?: Cache<Cardano.TxOut>;

  constructor({ cache, client, logger }: BlockfrostInputResolverDependencies) {
    this.#txCache = cache;
    this.#client = client;
    this.#logger = logger;
  }

  public async resolveInput(
    input: Cardano.TxIn,
    options?: Cardano.ResolveOptions
  ): Promise<Cardano.TxOut | null> {
    this.#logger.debug(`Resolving input ${input.txId}#${input.index}`);

    // Try cache first if available
    if (this.#txCache) {
      const cached = await this.#txCache.get(txInToId(input));
      if (cached) {
        this.#logger.debug(
          `Resolved input ${input.txId}#${input.index} from cache`
        );
        return cached;
      }
    }

    // Try hints from options
    if (options?.hints.transactions) {
      for (const hint of options.hints.transactions) {
        if (input.txId === hint.id && hint.body.outputs.length > input.index) {
          this.#logger.debug(
            `Resolved input ${input.txId}#${input.index} from hint`
          );
          if (this.#txCache) {
            void this.#txCache.set(
              txInToId(input),
              hint.body.outputs[input.index]
            );
          }
          return hint.body.outputs[input.index];
        }
      }
    }

    if (options?.hints.utxos) {
      for (const utxo of options.hints.utxos) {
        if (input.txId === utxo[0].txId && input.index === utxo[0].index) {
          this.#logger.debug(
            `Resolved input ${input.txId}#${input.index} from hint`
          );
          if (this.#txCache) {
            void this.#txCache.set(txInToId(input), utxo[1]);
          }
          return utxo[1];
        }
      }
    }

    // Fetch from Blockfrost API
    try {
      const response = await this.#client.request<any>(
        `txs/${input.txId}/utxos`
      );

      if (
        response &&
        response.outputs &&
        response.outputs.length > input.index
      ) {
        const output = BlockfrostToCore.txOut(response.outputs[input.index]);
        if (this.#txCache) {
          void this.#txCache.set(txInToId(input), output);
        }
        return output;
      }
    } catch (error: any) {
      if (error?.status === NOT_FOUND_STATUS) {
        this.#logger.debug(
          `Input ${input.txId}#${input.index} not found on Blockfrost`
        );
        return null;
      }
      this.#logger.error(
        `Error resolving input ${input.txId}#${input.index}:`,
        error
      );
      throw error;
    }

    return null;
  }
}
