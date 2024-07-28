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
 * Clone an object via JSON serialization.
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
 * Validate that `callback(value)` is truthy, and return `value`, otherwise throw.
 * @example assertCallback(val, val => val > 0, "Val must be > 0")
 */
export function assertCallback<T>(
  value: T,
  callback: (value: T) => any,
  message?: string,
): T {
  if (!callback(value)) throw new Error(message || "Assertion failed");
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

/**
 * A simple template literal tag for SQL queries which doesn't really do anything.
 * @example sql`SELECT * FROM table WHERE id = ${id}`
 */
export function sql(strings: TemplateStringsArray, ...values: any[]): string {
  return strings.reduce(
    (acc, string, index) => acc + string + (values[index] ?? ""),
    "",
  );
}

/**
 * Remove a sequence from the end of the source string.
 *
 * @example
 * trimEndAny("hello world", ["world"]) // => "hello "
 * trimEndAny("hello world", ["foo"]) // => "hello world"
 */
export function trimEndAny(source: string, sequences: string[]): string {
  for (const stopSequence of sequences) {
    if (source.endsWith(stopSequence)) {
      return source.slice(0, -stopSequence.length);
    }
  }

  return source;
}

/**
 * Either sleep for a number of milliseconds or
 * return the promise, whichever takes longer.
 *
 * @example
 * await minDelay(fastPromise, 1000) // Returns after at least 1 second.
 */
export async function minDelay(
  promise: Promise<any>,
  ms: number,
): Promise<void> {
  await Promise.all([sleep(ms), promise]);
}
