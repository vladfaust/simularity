import { userIdCookieName } from "@/server.js";
import { validateJwt } from "@/server/trpc/commands/routes/auth/_common";
import cookie from "cookie";
import { Request } from "express";

/**
 * Extract the authenticated user from the request, if any.
 */
export async function getAuthenticatedUserId(
  req: Request,
): Promise<string | null> {
  const cookies = cookie.parse(req.headers.cookie ?? "");
  const userId = cookies[userIdCookieName];
  if (userId) return userId;

  const jwt = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!jwt) return null;

  const payload = await validateJwt(jwt);
  if (!payload) return null;

  return payload.userId;
}
