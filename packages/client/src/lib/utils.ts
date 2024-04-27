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
