import { d } from "@/lib/drizzle.js";
import { v } from "@/lib/valibot.js";
import { protectedProcedure } from "@/server/trpc/middleware/auth.js";
import { wrap } from "@typeschema/valibot";
import { eq } from "drizzle-orm";

/**
 * Get the account balance of the current user.
 * The balance may change frequently, hence the separate endpoint.
 */
// TODO: Convert to a subscription.
export default protectedProcedure
  .output(
    wrap(
      v.object({
        credit: v.string(),
      }),
    ),
  )
  .query(async ({ ctx }) => {
    const user = await d.db.query.users.findFirst({
      where: eq(d.users.id, ctx.userId),
      columns: {
        creditBalance: true,
      },
    });

    if (!user) {
      throw new Error(`User not found in database: ${ctx.userId}`);
    }

    return {
      credit: user.creditBalance,
    };
  });
