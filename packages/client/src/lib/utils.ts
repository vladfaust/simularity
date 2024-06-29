export function throwError(...args: any[]): never {
  throw new Error(args.join(" "));
}

export class Deferred<T> {
  readonly promise: Promise<T>;
  private _resolve!: (value: T | PromiseLike<T>) => void;
  private _reject!: (reason: any) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  resolve(value: T | PromiseLike<T>): void {
    this._resolve(value);
  }

  reject(reason: any): void {
    this._reject(reason);
  }
}

/**
 * Zip two arrays into an array of tuples.
 * @example zip([1, 2], ["a", "b"]) => [[1, "a"], [2, "b"]]
 */
export function zip<A, B>(a: A[], b: B[]): [A, B][] {
  return a.map((_, i) => [a[i], b[i]]);
}

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

/**
 * Returns a new object with entries sorted by key.
 */
export function sortByKey<T extends { [key: string]: any }>(
  obj: T,
  compareFn?: (a: string, b: string) => number,
): T {
  return Object.keys(obj)
    .sort(compareFn)
    .reduce((acc, key) => {
      (acc as any)[key] = obj[key];
      return acc;
    }, {} as T);
}

// Sleep for a number of milliseconds.
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clones an object using JSON serialization.
 */
export function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Would panic upon non-exhaustive-ness.
 * @example default: unreachable(case)
 */
export function unreachable(arg: never) {
  return arg;
}

/**
 * Check if value is truthy and return it, otherwise throw.
 * @example assert(a > b, "a must be greater than b")
 */
export function assert<T>(value: T, message?: string): NonNullable<T> {
  if (!value) throw new Error(message || "Assertion failed");
  return value;
}

/**
 * Validate that `call(value)` is truthy, and return `value`, otherwise throw.
 * @example assertFn(val, val => val > 0, "Val must be > 0")
 */
export function assertFn<T>(
  value: T,
  call: (value: T) => any,
  message?: string,
): T {
  if (!call(value)) throw new Error(message || "Assertion failed");
  return value;
}

/**
 * Create an AbortSignal that will be aborted after the given timeout.
 */
export function timeoutSignal(timeout: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);
  return controller.signal;
}

/**
 * Remove empty-after-trimming strings from an array of strings.
 */
export function filterWhitespaceStrings(strings: string[]): string[] {
  return strings.filter((s) => s.trim().length);
}

/**
 * Return a hash digest of the given data.
 */
export async function digest(
  data: string,
  algorithm: AlgorithmIdentifier,
): Promise<Uint8Array> {
  const buffer = new TextEncoder().encode(data);
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
