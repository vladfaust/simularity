import { d } from "@/lib/drizzle.js";
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
      },
    });

    return res.json(llmModels);
  });
