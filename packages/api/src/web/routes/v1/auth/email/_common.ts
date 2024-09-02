export type EmailCodeRedisObject = {
  email: string;
  nonce?: string;
};

export function emailCodeRedisKey(code: string) {
  return `auth:email:${code}`;
}
