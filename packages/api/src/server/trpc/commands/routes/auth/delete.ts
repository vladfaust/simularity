import { userIdCookieName } from "@/server.js";
import { ExpressContext } from "@/server/trpc/commands/context.js";
import { protectedProcedure } from "@/server/trpc/middleware/auth.js";

export default protectedProcedure.mutation(async ({ ctx }) => {
  (ctx as ExpressContext).res.clearCookie(userIdCookieName, {
    httpOnly: true,
  });
});
