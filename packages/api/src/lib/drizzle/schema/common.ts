import { CurrencySchema } from "@/lib/schema.js";
import { v } from "@/lib/valibot.js";
import { customType } from "drizzle-orm/pg-core";

export const ProviderPricingModel = v.object({
  type: v.literal("perSecond"),
  currency: CurrencySchema,
  price: v.number(),
});

/**
 * PostgreSQL `bytea` type.
 */
export const bytea = customType<{
  data: Buffer;
}>({
  dataType() {
    return "bytea";
  },
});
