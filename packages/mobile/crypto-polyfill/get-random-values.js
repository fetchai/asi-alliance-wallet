import { getRandomBytes } from "expo-crypto";
const MAX_RANDOM_BYTES = 65536;
/**
 * An implementation of Crypto.getRandomValues that uses expo-random's secure random generator if
 * available and falls back to Math.random (cryptographically insecure) when synchronous bridged
 * methods are unavailable.
 *
 * See https://www.w3.org/TR/WebCryptoAPI/#Crypto-method-getRandomValues
 */
export default function getRandomValues(values) {
  if (arguments.length < 1) {
    throw new TypeError(
      `An ArrayBuffer view must be specified as the destination for the random values`
    );
  }
  if (
    !(values instanceof Int8Array) &&
    !(values instanceof Uint8Array) &&
    !(values instanceof Int16Array) &&
    !(values instanceof Uint16Array) &&
    !(values instanceof Int32Array) &&
    !(values instanceof Uint32Array) &&
    !(values instanceof Uint8ClampedArray)
  ) {
    throw new TypeError(
      `The provided ArrayBuffer view is not an integer-typed array`
    );
  }
  if (values.byteLength > MAX_RANDOM_BYTES) {
    throw new QuotaExceededError(
      `The ArrayBuffer view's byte length (${values.byteLength}) exceeds the number of bytes of entropy available via this API (${MAX_RANDOM_BYTES})`
    );
  }
  let randomBytes;
  try {
    // NOTE: Consider implementing `fillRandomBytes` to populate the given TypedArray directly
    randomBytes = getRandomBytes(values.byteLength);
  } catch (e) {
    // TODO: rethrow the error if it's not due to a lack of synchronous methods
    console.warn(`Random.getRandomBytes is not supported`);
    throw e;
  }
  // Create a new TypedArray that is of the same type as the given TypedArray but is backed with the
  // array buffer containing random bytes. This is cheap and copies no data.
  const TypedArrayConstructor = values.constructor;
  const randomValues = new TypedArrayConstructor(
    randomBytes.buffer,
    randomBytes.byteOffset,
    values.length
  );
  // Copy the data into the given TypedArray, letting the VM optimize the copy if possible
  values.set(randomValues);
  return values;
}
class QuotaExceededError extends Error {
  name = "QuotaExceededError";
  code = 22; // QUOTA_EXCEEDED_ERR
}
