import { userIdCookieName } from "@/server.js";
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
  else return null;
}
