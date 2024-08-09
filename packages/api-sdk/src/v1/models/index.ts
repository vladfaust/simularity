import { MultiLangTextSchema } from "../../common";
import { v } from "../../lib/valibot";

export const ResponseSchema = v.array(
  v.object({
    id: v.string(),
    task: v.string(),
    name: v.string(),
    description: v.nullable(MultiLangTextSchema),
    contextSize: v.number(),
  })
);
