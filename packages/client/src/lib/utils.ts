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
