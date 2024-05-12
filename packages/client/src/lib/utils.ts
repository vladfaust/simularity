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
 * Split code into lines by `\n` and `;` characters, trimmed.
 *
 * NOTE: May fail on strings, e.g. `print("Hello; world\\n")`.
 */
export function splitCode(code: string): string[] {
  return code
    .split(/[\n;]/)
    .map((line) => line.trim())
    .filter((line) => line.length);
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
