/* Package-wide Jest bootstrap: only polyfills `global` for jsdom + React act flag.
 * Does not stub console; if a suite needs stricter warnings, override locally. */
/* Jest loads some dependencies (e.g. graceful-fs via expect) that assume Node `global` exists.
 * jsdom environments omit it — align with Node before the test framework initializes. */
// eslint-disable-next-line no-undef
if (typeof globalThis.global === "undefined") {
  globalThis.global = globalThis;
}
/** React 18+ concurrent roots: silence act() warnings in tests. */
// eslint-disable-next-line no-undef
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
