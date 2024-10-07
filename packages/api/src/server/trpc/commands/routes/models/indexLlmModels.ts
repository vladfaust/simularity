import { d } from "@/lib/drizzle.js";
import { MultiLocaleTextSchema } from "@/lib/schema";
import { v } from "@/lib/valibot.js";
import { t } from "@/server/trpc.js";
import { wrap } from "@typeschema/valibot";
import { and, eq } from "drizzle-orm";

/**
 * Index LLM models by task.
 */
export default t.procedure
  .input(
    wrap(
      v.object({
        task: v.union([v.literal("writer"), v.literal("director")]),
      }),
    ),
  )
  .output(
    wrap(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          description: v.nullable(MultiLocaleTextSchema),
          contextSize: v.number(),
          creditPrice: v.nullable(v.string()),
        }),
      ),
    ),
  )
  .query(async ({ input }) => {
    return d.db.query.llmModels.findMany({
      where: and(
        eq(d.llmModels.task, input.task),
        eq(d.llmModels.enabled, true),
      ),
      columns: {
        id: true,
        task: true,
        name: true,
        description: true,
        contextSize: true,
        creditPrice: true,
      },
    });
  });
