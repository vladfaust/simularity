import { env } from "@/env.js";
import { konsole } from "@/lib/konsole.js";
import { Request } from "express";
import * as jose from "jose";

/**
 * Validate a JWT and return the payload if successful.
 */
export async function validateJwt(jwt: string) {
  try {
    const { payload } = await jose.jwtVerify<{ userId: string }>(
      jwt,
      env.JWT_SECRET,
      { issuer: env.JWT_ISSUER },
    );

    return payload;
  } catch (error) {
    konsole.debug(`JWT validation failed`, error);
    return null;
  }
}

/**
 * Extract the authenticated user from the request, if any.
 */
export async function getAuthenticatedUserId(
  req: Request,
): Promise<string | null> {
  const jwt = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!jwt) return null;

  const payload = await validateJwt(jwt);
  if (!payload) return null;

  return payload.userId;
}
