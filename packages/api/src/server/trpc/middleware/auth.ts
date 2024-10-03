import { t } from "@/server/trpc.js";
import { TRPCError } from "@trpc/server";

const reqUser = t.middleware(({ next, ctx }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

/**
 * Requires the user to be authenticated.
 */
export const protectedProcedure = t.procedure.use(reqUser);
