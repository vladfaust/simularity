import { d } from "@/lib/drizzle.js";
import {
  LlmModelTaskSchema,
  MultiLocaleTextSchema,
  SubscriptionTierSchema,
} from "@/lib/schema";
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
      v.optional(
        v.object({
          task: v.optional(LlmModelTaskSchema),
        }),
      ),
    ),
  )
  .output(
    wrap(
      v.array(
        v.object({
          id: v.string(),
          task: LlmModelTaskSchema,
          name: v.string(),
          description: v.nullable(MultiLocaleTextSchema),
          contextSize: v.number(),
          requiredSubscriptionTier: v.nullable(SubscriptionTierSchema),
        }),
      ),
    ),
  )
  .query(async ({ input }) => {
    const conditions = [eq(d.llmModels.enabled, true)];

    if (input?.task) {
      conditions.push(eq(d.llmModels.task, input.task));
    }

    return d.db.query.llmModels.findMany({
      where: and(...conditions),
      columns: {
        id: true,
        task: true,
        name: true,
        description: true,
        contextSize: true,
        requiredSubscriptionTier: true,
      },
    });
  });
