import { d } from "@/lib/drizzle.js";
import { v } from "@/lib/valibot.js";
import { t } from "@/server/trpc.js";
import { wrap } from "@typeschema/valibot";
import { and, eq, sql } from "drizzle-orm";

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
      const nameFilter = `%${input.nameFilter}%`;

      conditions.push(sql`
        EXISTS (
          SELECT
            1
          FROM
            jsonb_each_text(${d.scenarios.name}) AS name_pair
          WHERE
            name_pair.value ILIKE ${nameFilter}
        )
      `);
    }

    return (
      await d.db.query.scenarios.findMany({
        where: and(...conditions),
        columns: { id: true },
      })
    ).map((x) => x.id);
  });
