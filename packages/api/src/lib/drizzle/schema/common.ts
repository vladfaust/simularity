import { CurrencySchema } from "@/lib/schema.js";
import { v } from "@/lib/valibot.js";

export const ProviderPricingModel = v.object({
  type: v.literal("perSecond"),
  currency: CurrencySchema,
  price: v.number(),
});
