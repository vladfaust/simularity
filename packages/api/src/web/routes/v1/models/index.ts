import { d } from "@/lib/drizzle.js";
import { v } from "@/lib/valibot.js";
import { ResponseSchema } from "@simularity/api-sdk/v1/models/index";
import cors from "cors";
import { eq } from "drizzle-orm";
import { Router } from "express";

/**
 * Index all enabled models.
 */
export default Router()
  .use(cors())
  .get("/", async (req, res) => {
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

    return res.json([
      ...llmModels.map((model) => ({
        type: "llm" as const,
        ...model,
      })),
      ...ttsModels.map((model) => ({
        type: "tts" as const,
        ...model,
      })),
    ] satisfies v.InferOutput<typeof ResponseSchema>);
  });
