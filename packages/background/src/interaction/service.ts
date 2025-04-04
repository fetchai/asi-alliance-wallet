import { InteractionWaitingData } from "./types";
import {
  Env,
  FnRequestInteractionOptions,
  MessageRequester,
} from "@keplr-wallet/router";
import { PushEventDataMsg, PushInteractionDataMsg } from "./foreground";
import { RNG } from "@keplr-wallet/crypto";

export class InteractionService {
  protected waitingMap: Map<string, InteractionWaitingData> = new Map();
  protected resolverMap: Map<
    string,
    { onApprove: (result: unknown) => void; onReject: (e: Error) => void }
  > = new Map();

  constructor(
    protected readonly eventMsgRequester: MessageRequester,
    protected readonly rng: RNG
  ) {}

  init() {
    // noop
  }

  // Dispatch the event to the frontend. Don't wait any interaction.
  // And, don't ensure that the event is delivered successfully, just ignore the any errors.
  dispatchEvent(port: string, type: string, data: unknown) {
    if (!type) {
      throw new Error("Type should not be empty");
    }

    const msg = new PushEventDataMsg({
      type,
      data,
    });

    this.eventMsgRequester.sendMessage(port, msg).catch((e) => {
      console.log(`Failed to send the event to ${port}: ${e.message}`);
    });
  }

  async dispatchEventAndData(
    env: Env,
    port: string,
    type: string,
    data: unknown
  ) {
    if (!type) {
      throw new Error("Type should not be empty");
    }
    const interactionWaitingData = await this.addDataToMap(
      type,
      env.isInternalMsg,
      data
    );

    const msgInteraction = new PushInteractionDataMsg(interactionWaitingData);
    this.eventMsgRequester.sendMessage(port, msgInteraction).catch((e) => {
      console.log(
        `Failed to send the Interaction data event to ${port}: ${e.message}`
      );
    });

    const msgPushEvent = new PushEventDataMsg(interactionWaitingData);
    this.eventMsgRequester.sendMessage(port, msgPushEvent).catch((e) => {
      console.log(`Failed to send the event to ${port}: ${e.message}`);
    });
  }

  async waitApprove(
    env: Env,
    url: string,
    type: string,
    data: unknown,
    options?: FnRequestInteractionOptions
  ): Promise<unknown> {
    if (!type) {
      throw new Error("Type should not be empty");
    }

    // TODO: Add timeout?
    const interactionWaitingData = await this.addDataToMap(
      type,
      env.isInternalMsg,
      data
    );

    const msg = new PushInteractionDataMsg(interactionWaitingData);

    return await this.wait(msg.data.id, () => {
      env.requestInteraction(url, msg, options);
    });
  }

  protected async wait(id: string, fn: () => void): Promise<unknown> {
    if (this.resolverMap.has(id)) {
      throw new Error("Id is aleady in use");
    }

    return new Promise<unknown>((resolve, reject) => {
      this.resolverMap.set(id, {
        onApprove: resolve,
        onReject: reject,
      });

      fn();
    });
  }

  approve(id: string, result: unknown) {
    if (this.resolverMap.has(id)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.resolverMap.get(id)!.onApprove(result);
      this.resolverMap.delete(id);
    }

    this.removeDataFromMap(id);
  }

  reject(id: string) {
    if (this.resolverMap.has(id)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.resolverMap.get(id)!.onReject(new Error("Request rejected"));
      this.resolverMap.delete(id);
    }

    this.removeDataFromMap(id);
  }

  protected async addDataToMap(
    type: string,
    isInternal: boolean,
    data: unknown
  ): Promise<InteractionWaitingData> {
    const bytes = new Uint8Array(12);
    const id: string = Array.from(await this.rng(bytes))
      .map((value) => {
        let v = value.toString(16);
        if (v.length === 1) {
          v = "0" + v;
        }
        return v;
      })
      .join("");

    const interactionWaitingData: InteractionWaitingData = {
      id,
      type,
      isInternal,
      data,
    };

    if (this.waitingMap.has(id)) {
      throw new Error("Id is aleady in use");
    }

    this.waitingMap.set(id, interactionWaitingData);
    return interactionWaitingData;
  }

  protected removeDataFromMap(id: string) {
    this.waitingMap.delete(id);
  }
}
