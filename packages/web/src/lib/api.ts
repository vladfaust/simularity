export * as auth from "./api/auth";
export * as users from "./api/users";

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
  ) {
    super(message);
  }
}
