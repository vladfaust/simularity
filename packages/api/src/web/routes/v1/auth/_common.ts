import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { eq } from "drizzle-orm";
import { Request, Response } from "express";
import * as jose from "jose";

type AuthPayload = jose.JWTPayload & {
  /**
   * Logged-in user ID.
   */
  uid: string;
};

export async function createJwt(uid: string) {
  return await new jose.SignJWT({ uid } satisfies AuthPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(env.JWT_ISSUER)
    .sign(env.JWT_SECRET);
}

export async function verifyJwt(jwt: string) {
  try {
    return await jose.jwtVerify<AuthPayload>(jwt, env.JWT_SECRET, {
      issuer: env.JWT_ISSUER,
    });
  } catch (e: any) {
    if (e instanceof jose.errors.JOSEError) {
      return { error: e };
    } else {
      throw e;
    }
  }
}

/**
 * Ensure the user is authenticated.
 * Otherwise, sets the response status to 401 and returns.
 */
export async function ensureUser(req: Request, res: Response) {
  // Extract JWT from `Authorization: Bearer {token}` header.
  const jwt = req.headers.authorization?.split(" ")[1];
  if (!jwt) {
    konsole.log("No JWT in Authorization header");
    return;
  }

  // Verify the JWT.
  const jwtVerifyResult = await verifyJwt(jwt);
  if ("error" in jwtVerifyResult) {
    konsole.log("Invalid JWT", jwtVerifyResult.error);
    return;
  }

  const user = await d.db.query.users.findFirst({
    where: eq(d.users.id, jwtVerifyResult.payload.uid),
  });

  if (!user) {
    throw new Error("Valid JWT payload contains non-existing user ID");
  }

  return user;
}
