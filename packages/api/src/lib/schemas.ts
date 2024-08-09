import { v } from "./valibot.js";

export const LangSchema = v.union([v.literal("en")]);
export const MultiLangTextSchema = v.record(LangSchema, v.string());
export const CurrencySchema = v.union([v.literal("usd")]);
export const MultiCurrencyCostSchema = v.record(CurrencySchema, v.number());
