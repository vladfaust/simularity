import { d } from "@/lib/drizzle.js";
import { v } from "@/lib/valibot.js";
import { t } from "@/server/trpc.js";
import { wrap } from "@typeschema/valibot";
import { eq } from "drizzle-orm";

export const LangSchema = v.union([v.literal("en")]);
export const MultiLangTextSchema = v.record(LangSchema, v.string());

export const LlmModel = v.object({
  type: v.literal("llm"),
  task: v.union([v.literal("writer"), v.literal("director")]),
  id: v.string(),
  name: v.string(),
  description: v.nullable(MultiLangTextSchema),
  contextSize: v.number(),
  creditPrice: v.nullable(v.string()),
});

export const TtsModel = v.object({
  type: v.literal("tts"),
  id: v.string(),
  name: v.string(),
  description: v.nullable(MultiLangTextSchema),
  creditPrice: v.nullable(v.string()),
});

export const ResponseSchema = v.array(v.variant("type", [LlmModel, TtsModel]));

/**
 * Index all enabled models.
 */
export default t.procedure.output(wrap(ResponseSchema)).query(async () => {
  const llmModels = await d.db.query.llmModels.findMany({
    where: eq(d.llmModels.enabled, true),
    columns: {
      id: true,
      task: true,
      name: true,
      description: true,
      contextSize: true,
      creditPrice: true,
    },
  });

  const ttsModels = await d.db.query.ttsModels.findMany({
    where: eq(d.ttsModels.enabled, true),
    columns: {
      id: true,
      name: true,
      description: true,
      creditPrice: true,
    },
  });

  return [
    ...llmModels.map((model) => ({
      type: "llm" as const,
      ...model,
    })),
    ...ttsModels.map((model) => ({
      type: "tts" as const,
      ...model,
    })),
  ];
});
