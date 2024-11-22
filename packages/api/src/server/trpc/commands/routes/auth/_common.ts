import { env } from "@/env.js";
import { toMilliseconds } from "duration-fns";
import * as jose from "jose";
import { ExpressContext } from "../../context.js";

/**
 * Set a cookie with the user ID, and also create a JWT.
 */
export async function setCookie(
  ctx: ExpressContext,
  userId: string,
  cookieMaxAge = toMilliseconds({ weeks: 2 }),
) {
  const jwt = await new jose.SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(env.JWT_ISSUER)
    .setExpirationTime(new Date(Date.now() + cookieMaxAge))
    .sign(env.JWT_SECRET);

  return { cookieMaxAge, jwt };
}
