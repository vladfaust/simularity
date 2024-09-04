import { ResponseOkError } from "./errors.js";
import { konsole } from "./konsole.js";
import * as patreon from "./patreon.js";
import { unreachable } from "./utils.js";
import { v } from "./valibot.js";

export const OAuthProviderIdSchema = v.picklist(["patreon"]);
export type OAuthProviderId = v.InferOutput<typeof OAuthProviderIdSchema>;

export const OAuthProviderSchema = v.object({
  baseUrl: v.pipe(v.string(), v.url()),

  /** E.g. Patreon has `www.patreon.com/oauth2/authorize`. */
  authorizeUrl: v.optional(v.pipe(v.string(), v.url())),

  clientId: v.string(),
  clientSecret: v.string(),
  redirectUris: v.object({
    login: v.pipe(v.string(), v.url()),
    link: v.pipe(v.string(), v.url()),
  }),
  scope: v.optional(v.string(), ""),
});
export type OAuthProvider = v.InferOutput<typeof OAuthProviderSchema>;

export type FetchTokenResponse = {
  tokenType: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken?: string;
  refreshTokenExpiresAt?: Date;
  scope?: string;
  user?: {
    id: string;
    email: string;
  };
};

export async function fetchToken(
  providerId: OAuthProviderId,
  provider: OAuthProvider,
  input: {
    code: string;
    state: string;
    reason: "link" | "login";
  },
  includeUser: boolean,
): Promise<FetchTokenResponse> {
  const formData = new FormData();
  formData.append("code", input.code);
  formData.append("client_id", provider.clientId);
  formData.append("client_secret", provider.clientSecret);
  formData.append("grant_type", "authorization_code");
  formData.append("redirect_uri", provider.redirectUris[input.reason]);

  const body = new URLSearchParams();
  for (const pair of formData) {
    body.append(pair[0], pair[1].toString());
  }

  konsole.debug(provider.baseUrl + "/token", body);
  const response = await fetch(provider.baseUrl + "/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw await ResponseOkError.from(response);
  }

  return response.json().then((json) => {
    konsole.debug(json);

    switch (providerId) {
      case "patreon": {
        return patreon.parseTokenResponse(provider.baseUrl, json, includeUser);
      }

      default:
        throw unreachable(providerId);
    }
  });
}
