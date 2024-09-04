import { toMilliseconds } from "duration-fns";
import { FetchTokenResponse } from "./oauth.js";
import { getIdentity } from "./patreon/getIdentity.js";
import { TokenResponseSchema } from "./patreon/schema.js";
import { v } from "./valibot.js";

export async function parseTokenResponse(
  baseUrl: string,
  json: any,
  includeUser: boolean,
): Promise<FetchTokenResponse> {
  const tokenResponse = v.parse(TokenResponseSchema, json);

  let user;
  if (includeUser) {
    user = await getIdentity(
      baseUrl,
      tokenResponse.token_type,
      tokenResponse.access_token,
      ["email"],
    );
  }

  return {
    tokenType: tokenResponse.token_type,
    accessToken: tokenResponse.access_token,

    accessTokenExpiresAt: new Date(
      Date.now() + toMilliseconds({ seconds: tokenResponse.expires_in }),
    ),

    refreshToken: tokenResponse.refresh_token,
    scope: tokenResponse.scope,

    user: user
      ? {
          id: user.data.id,
          email: user.data.attributes.email as string,
        }
      : undefined,
  };
}
