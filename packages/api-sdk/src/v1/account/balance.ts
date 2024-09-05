import * as v from "valibot";

export const ResponseSchema = v.object({
  /**
   * The user's credit balance, as decimal string.
   */
  credit: v.optional(v.string()),
});
