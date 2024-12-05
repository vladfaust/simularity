import * as v from "valibot";

export const LocaleSchema = v.union([v.literal("en-US"), v.literal("ru-RU")]);
export const MultiLocaleTextSchema = v.record(
  LocaleSchema,
  v.pipe(v.string(), v.trim(), v.nonEmpty()),
);

export const CurrencySchema = v.union([v.literal("usd")]);
export const MultiCurrencyCostSchema = v.record(CurrencySchema, v.number());
