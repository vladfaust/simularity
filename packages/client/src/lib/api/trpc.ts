import { env } from "@/env";
import type { CommandsRouter } from "@simularity/api/trpc/commands/router";
import type { SubscriptionsRouter } from "@simularity/api/trpc/subscriptions/router";
import {
  TRPCClientError,
  createTRPCProxyClient,
  createWSClient,
  httpBatchLink,
  loggerLink,
  wsLink,
} from "@trpc/client";
import { jwtStorage } from "../storage/user";

export interface Unsubscribable {
  unsubscribe(): void;
}

export const commandsClient = createTRPCProxyClient<CommandsRouter>({
  links: [
    loggerLink({
      enabled: (opts) =>
        (process.env.NODE_ENV === "development" &&
          typeof window !== "undefined") ||
        (opts.direction === "down" && opts.result instanceof Error),
    }),
    httpBatchLink({
      url: env.VITE_API_BASE_URL + "/trpc/commands",
      fetch(url, options) {
        if (jwtStorage.value) {
          (options ??= {}).headers ??= {};

          options.headers = {
            ...options.headers,
            Authorization: `Bearer ${jwtStorage.value}`,
          };
        }

        return fetch(url, {
          ...options,
          credentials: "include",
        });
      },
    }),
  ],
});

function createWsClient() {
  return createTRPCProxyClient<SubscriptionsRouter>({
    links: [
      loggerLink({
        enabled: (opts) =>
          process.env.NODE_ENV === "development" ||
          (opts.direction === "down" && opts.result instanceof Error),
      }),
      wsLink({
        client: createWSClient({
          url: toWsUrl(env.VITE_API_BASE_URL + "/trpc/subscriptions"),
          onOpen: () => console.debug("WebSocket open"),
          onClose: () => console.debug("WebSocket close"),
        }),
      }),
    ],
  });
}

export let subscriptionsClient = createWsClient();

export function recreateSubscriptionsClient() {
  console.log("Recreating subscriptions client");
  subscriptionsClient = createWsClient();
}

/**
 * Catch and alert on TRPC errors.
 */
export async function alertOnTrpcError<T>(promise: PromiseLike<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof TRPCClientError) {
      alert(e.message);
    }

    throw e;
  }
}

function toWsUrl(url: string) {
  return url.replace(/^http/, "ws");
}
