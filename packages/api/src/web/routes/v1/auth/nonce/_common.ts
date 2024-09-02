import { toSeconds } from "duration-fns";

export const NONCE_TTL = toSeconds({ minutes: 5 });

export function nonceRedisKey(nonce: string) {
  return `auth:nonce:${nonce}`;
}
