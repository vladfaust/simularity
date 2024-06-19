/**
 * @author https://stackoverflow.com/a/56592365/3645337
 */
export const pick = <T extends {}, K extends keyof T>(obj: T, keys: Array<K>) =>
  Object.fromEntries(
    keys.filter((key) => key in obj).map((key) => [key, obj[key]]),
  ) as Pick<T, K>;

/**
 * @author https://stackoverflow.com/a/56592365/3645337
 */
export const omit = <T extends {}, K extends keyof T>(obj: T, keys: Array<K>) =>
  Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keys.includes(key as K)),
  ) as Omit<T, K>;

export function safeParseJson(json: string) {
  try {
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

/**
 * Create an AbortSignal that will be aborted after the given timeout.
 */
export function abortSignal(timeout: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);
  return controller.signal;
}

/**
 * Return a hash digest of the given data.
 */
export async function digest(
  data: string,
  algorithm: AlgorithmIdentifier,
): Promise<Buffer> {
  const buffer = new TextEncoder().encode(data);
  return Buffer.from(await crypto.subtle.digest(algorithm, buffer));
}

/**
 * Return a hex string representation of a buffer (without leading `0x`).
 */
export function bufferToHex(buffer: Uint8Array): string {
  return Array.prototype.map
    .call(buffer, (x) => x.toString(16).padStart(2, "0"))
    .join("");
}
