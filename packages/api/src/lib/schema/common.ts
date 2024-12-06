import * as v from "valibot";

export const LocaleSchema = v.union([v.literal("en-US"), v.literal("ru-RU")]);
export type Locale = v.InferOutput<typeof LocaleSchema>;

export const MultiLocaleTextSchema = v.record(
  LocaleSchema,
  v.pipe(v.string(), v.trim(), v.nonEmpty()),
);
export type MultiLocaleText = v.InferOutput<typeof MultiLocaleTextSchema>;

export const CurrencySchema = v.union([v.literal("usd")]);
export type Currency = v.InferOutput<typeof CurrencySchema>;

export const MultiCurrencyCostSchema = v.record(CurrencySchema, v.number());
export type MultiCurrencyCost = v.InferOutput<typeof MultiCurrencyCostSchema>;
