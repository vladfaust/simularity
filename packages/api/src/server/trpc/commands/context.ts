import { getAuthenticatedUserId } from "@/server/_common.js";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { Request, Response } from "express";
import { Context } from "../context.js";

export type ExpressContext = Context & {
  req: Request;
  res: Response;
};

export async function createExpressContext({
  req,
  res,
}: CreateExpressContextOptions): Promise<ExpressContext> {
  const userId = await getAuthenticatedUserId(req);

  return {
    req,
    res,
    userId,
  };
}
