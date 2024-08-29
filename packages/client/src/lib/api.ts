export * as v1 from "./api/v1";
import * as tauriHttp from "@tauri-apps/api/http";

export class RemoteApiError extends Error {
  constructor(
    readonly response: Response | tauriHttp.Response<unknown>,
    message: string,
  ) {
    super(message);
    this.name = "RemoteApiError";
  }
}
