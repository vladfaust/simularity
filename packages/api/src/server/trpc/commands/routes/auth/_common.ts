import { env } from "@/env.js";
import { konsole } from "@/lib/konsole.js";
import { userIdCookieName } from "@/server.js";
import { toMilliseconds } from "duration-fns";
import * as jose from "jose";
import { ExpressContext } from "../../context.js";

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
 * Set a cookie with the user ID, and also create a JWT.
 */
export async function setCookie(
  ctx: ExpressContext,
  userId: string,
  cookieMaxAge = toMilliseconds({ weeks: 2 }),
) {
  ctx.res.cookie(userIdCookieName, userId, {
    maxAge: cookieMaxAge,
  });

  const jwt = await new jose.SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(env.JWT_ISSUER)
    .setExpirationTime(new Date(Date.now() + cookieMaxAge))
    .sign(env.JWT_SECRET);

  return { cookieMaxAge, jwt };
}
