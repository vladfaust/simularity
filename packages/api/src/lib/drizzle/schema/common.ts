import { v } from "@/lib/valibot.js";
import { CurrencySchema } from "@simularity/api-sdk/common";

export const ProviderPricingModel = v.object({
  type: v.literal("perSecond"),
  currency: CurrencySchema,
  price: v.number(),
});
