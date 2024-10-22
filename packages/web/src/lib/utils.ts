import prettyBytes from "pretty-bytes";

/**
 * Would panic upon non-exhaustive-ness.
 * @example default: unreachable(case)
 */
export function unreachable(arg: never) {
  return arg;
}

/**
 * Return a hash digest of the given data.
 */
export async function digest(
  buffer: Uint8Array,
  algorithm: AlgorithmIdentifier,
): Promise<Uint8Array> {
  const result = await crypto.subtle.digest(algorithm, buffer);
  return new Uint8Array(result);
}

/**
 * Return a hex string representation of a buffer (without leading `0x`).
 */
export function bufferToHex(buffer: Uint8Array): string {
  return Array.prototype.map
    .call(buffer, (x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(buffer: Uint8Array): Promise<string> {
  return bufferToHex(await digest(buffer, "SHA-256"));
}

/**
 * @example prettyNumber(512) // => "512"
 * @example prettyNumber(8192) // => "8K"
 */
export function prettyNumber(
  number_: number,
  options?: { space: boolean },
): string {
  return prettyBytes(number_, { binary: true, ...options }).slice(
    0,
    number_ < 1024 ? -1 : -2,
  );
}

/**
 * Sleep for the given number of milliseconds.
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
