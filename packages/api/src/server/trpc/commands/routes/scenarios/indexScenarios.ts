import { d } from "@/lib/drizzle.js";
import { SubscriptionTierSchema } from "@/lib/schema";
import { v } from "@/lib/valibot.js";
import { t } from "@/server/trpc.js";
import { wrap } from "@typeschema/valibot";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * Return scenario IDs.
 */
export default t.procedure
  .input(
    wrap(
      v.object({
        showNsfw: v.boolean(),
        nameFilter: v.optional(v.string()),
        requiredSubscriptionTier: v.optional(
          v.nullable(SubscriptionTierSchema),
        ),
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

    if (input.requiredSubscriptionTier !== undefined) {
      if (input.requiredSubscriptionTier === null) {
        conditions.push(isNull(d.scenarios.requiredSubscriptionTier));
      } else {
        conditions.push(
          eq(
            d.scenarios.requiredSubscriptionTier,
            input.requiredSubscriptionTier,
          ),
        );
      }
    }

    return (
      await d.db.query.scenarios.findMany({
        where: and(...conditions),
        columns: { id: true },
      })
    ).map((x) => x.id);
  });
