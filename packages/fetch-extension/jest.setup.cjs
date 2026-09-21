/* Package-wide Jest bootstrap: polyfills for jsdom + React act flag.
 * Does not stub console; if a suite needs stricter warnings, override locally. */
/* Jest loads some dependencies (e.g. graceful-fs via expect) that assume Node `global` exists.
 * jsdom environments omit it — align with Node before the test framework initializes. */
// eslint-disable-next-line no-undef
if (typeof globalThis.global === "undefined") {
  globalThis.global = globalThis;
}
/* jsdom 16 / jest-environment-jsdom 26 omit TextEncoder/TextDecoder; cosmjs → @noble needs them at import. */
const { TextEncoder, TextDecoder } = require("node:util");
if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  globalThis.TextDecoder = TextDecoder;
}
/** React 18+ concurrent roots: silence act() warnings in tests. */
// eslint-disable-next-line no-undef
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
