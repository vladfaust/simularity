import { d } from "@/lib/drizzle.js";
import { v } from "@/lib/valibot.js";
import { t } from "@/server/trpc.js";
import { wrap } from "@typeschema/valibot";
import { and, eq, ilike } from "drizzle-orm";

/**
 * Return scenario IDs.
 */
export default t.procedure
  .input(
    wrap(
      v.object({
        showNsfw: v.boolean(),
        nameFilter: v.optional(v.string()),
      }),
    ),
  )
  .output(wrap(v.array(v.string())))
  .query(async ({ input }) => {
    const conditions = [];

    if (!input.showNsfw) {
      conditions.push(eq(d.scenarios.nsfw, false));
    }

    if (input.nameFilter) {
      conditions.push(ilike(d.scenarios.name, input.nameFilter));
    }

    return (
      await d.db.query.scenarios.findMany({
        where: and(...conditions),
        columns: { id: true },
      })
    ).map((x) => x.id);
  });
