import * as v from "valibot";

export const ResponseSchema = v.object({
  id: v.string(),

  /**
   * The user's email address.
   */
  email: v.optional(v.nullable(v.string())),

  /**
   * The user's credit balance, as decimal string.
   */
  creditBalance: v.optional(v.string()),
});
