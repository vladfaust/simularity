import { MultiLangTextSchema } from "../../common";
import * as v from "valibot";

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
