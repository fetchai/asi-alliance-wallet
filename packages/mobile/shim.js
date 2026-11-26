import "setimmediate";
import { BackHandler } from "react-native";

// RN 0.77 removed BackHandler.removeEventListener. Track subscriptions from
// addEventListener so older libs (react-native-modal 13) and app code still work.
if (typeof BackHandler.removeEventListener !== "function") {
  const subscriptionsByEvent = new Map();
  const originalAddEventListener =
    BackHandler.addEventListener.bind(BackHandler);

  BackHandler.addEventListener = (eventName, handler) => {
    const subscription = originalAddEventListener(eventName, handler);
    let handlers = subscriptionsByEvent.get(eventName);
    if (!handlers) {
      handlers = new Map();
      subscriptionsByEvent.set(eventName, handlers);
    }
    handlers.set(handler, subscription);
    return subscription;
  };

  BackHandler.removeEventListener = (eventName, handler) => {
    const handlers = subscriptionsByEvent.get(eventName);
    if (!handlers) {
      return;
    }
    const subscription = handlers.get(handler);
    if (subscription) {
      subscription.remove();
      handlers.delete(handler);
    }
  };
}

if (typeof Buffer === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  global.Buffer = require("buffer").Buffer;
}

if (!global.atob || !global.btoa) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const base64 = require("./shim-base64.js");
  global.atob = base64.atob;
  global.btoa = base64.btoa;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TextEncodingPolyfill = require("text-encoding");
Object.assign(global, {
  TextEncoder: TextEncodingPolyfill.TextEncoder,
  TextDecoder: TextEncodingPolyfill.TextDecoder,
});

import { polyfillWebCrypto } from "expo-standard-web-crypto";

polyfillWebCrypto();
// crypto is now globally defined

import "react-native-url-polyfill/auto";

import EventEmitter from "eventemitter3";

const eventListener = new EventEmitter();

window.addEventListener = (type, fn, options) => {
  if (options && options.once) {
    eventListener.once(type, fn);
  } else {
    eventListener.addListener(type, fn);
  }
};

window.removeEventListener = (type, fn) => {
  eventListener.removeListener(type, fn);
};

window.dispatchEvent = (event) => {
  eventListener.emit(event.type);
};
