import { userIdCookieName } from "@/server.js";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import cookie from "cookie";
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
  const cookies = cookie.parse(req.headers.cookie ?? "");

  if (cookies[userIdCookieName]) {
    return {
      req,
      res,
      userId: cookies[userIdCookieName],
    };
  } else {
    return {
      req,
      res,
      userId: null,
    };
  }
}
