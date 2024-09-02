import { toMilliseconds } from "duration-fns";
import { ResponseOkError } from "./errors.js";
import { FetchTokenResponse } from "./oauth.js";
import { v } from "./valibot.js";

export const TokenResponseSchema = v.object({
  access_token: v.string(),
  refresh_token: v.string(),
  expires_in: v.number(),
  scope: v.string(),
  token_type: v.string(),
});

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

const UserAttributeIdSchema = v.picklist([
  "about",
  "created",
  "email",
  "first_name",
  "full_name",
  "image_url",
  "last_name",
  "social_connections",
  "thumb_url",
  "url",
  "vanity",
]);

const UserSchema = v.object({
  id: v.string(),
  type: v.literal("user"),
  attributes: v.record(UserAttributeIdSchema, v.unknown()),
});

const IdentityResponseSchema = v.object({
  data: UserSchema,
});

export async function getIdentity(
  baseUrl: string,
  tokenType: string,
  accessToken: string,
  userFields: v.InferOutput<typeof UserAttributeIdSchema>[],
) {
  const url = new URL(`${baseUrl}/v2/identity`);
  url.searchParams.set("fields[user]", userFields.join(","));

  const response = await fetch(url, {
    headers: {
      Authorization: `${tokenType} ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw await ResponseOkError.from(response);
  }

  const json = await response.json();
  return v.parse(IdentityResponseSchema, json);
}
