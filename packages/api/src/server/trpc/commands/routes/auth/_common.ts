import { userIdCookieName } from "@/server.js";
import { toMilliseconds } from "duration-fns";
import { ExpressContext } from "../../context.js";

export function setCookie(
  ctx: ExpressContext,
  userId: string,
  maxAge = toMilliseconds({ weeks: 2 }),
) {
  ctx.res.cookie(userIdCookieName, userId, {
    maxAge,
    httpOnly: true,
  });

  return maxAge;
}
