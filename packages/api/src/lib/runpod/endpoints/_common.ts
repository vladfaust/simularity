import { konsole } from "@/lib/konsole";
import pRetry from "p-retry";

export class IrrecoverableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IrrecoverableError";
  }
}

export async function wrapRunpodRequest<T>(fn: () => Promise<T>): Promise<T> {
  return pRetry(fn, {
    retries: 5,
    onFailedAttempt: (e) => konsole.warn(e.message),
    shouldRetry: (e) => {
      if (e.name === "IrrecoverableError") {
        konsole.warn("Irrecoverable error, will not retry", e.message);
        return false;
      } else if (e.message.match("Request failed with status code 404")) {
        konsole.warn("Code 404, will not retry");
        return false;
      } else {
        return true;
      }
    },
  });
}
