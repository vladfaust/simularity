export * as auth from "./api/auth";
export * as account from "./api/account";

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
  ) {
    super(message);
  }
}
