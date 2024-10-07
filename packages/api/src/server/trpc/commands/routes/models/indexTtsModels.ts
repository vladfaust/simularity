import { d } from "@/lib/drizzle.js";
import { MultiLocaleTextSchema } from "@/lib/schema";
import { v } from "@/lib/valibot.js";
import { t } from "@/server/trpc.js";
import { wrap } from "@typeschema/valibot";
import { eq } from "drizzle-orm";

/**
 * Index TTS models.
 */
export default t.procedure
  .output(
    wrap(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          description: v.nullable(MultiLocaleTextSchema),
          creditPrice: v.nullable(v.string()),
        }),
      ),
    ),
  )
  .query(async () => {
    return d.db.query.ttsModels.findMany({
      where: eq(d.ttsModels.enabled, true),
      columns: {
        id: true,
        name: true,
        description: true,
        creditPrice: true,
      },
    });
  });
