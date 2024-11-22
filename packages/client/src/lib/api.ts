export * as rest from "./api/rest";
export * as trpc from "./api/trpc";

export class UnauthorizedError extends Error {
  constructor() {
    super();
    this.name = "UnauthorizedError";
  }
}

export class PaymentRequiredError extends Error {
  constructor() {
    super();
    this.name = "PaymentRequiredError";
  }
}
