export * as v1 from "./rest/v1";

export class RestError extends Error {
  constructor(
    readonly response: Response,
    message: string,
  ) {
    super(message);
    this.name = "RestError";
  }
}
