import { OAuthProviderId } from "@/lib/oauth.js";

export type OAuthRedisObject = {
  providerId: OAuthProviderId;
  reason: "login" | "link";
  returnUrl?: string;
};

export function oauthStateRedisKey(state: string) {
  return `auth:oauth:state:${state}`;
}
