import { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { IncomingMessage } from "http";
import { Context } from "../context.js";

export type WsContext = Context & {
  req: IncomingMessage;
};

export async function createWsContext({
  req,
  res,
}: CreateWSSContextFnOptions): Promise<WsContext> {
  return {
    userId: null,
    req,
  };
}
