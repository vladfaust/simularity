import * as v from "valibot";

export const ResponseSchema = v.object({
  id: v.string(),

  /**
   * The user's email address.
   */
  email: v.optional(v.nullable(v.string())),

  oAuthAccounts: v.object({
    patreon: v.nullable(
      v.object({
        tier: v.nullable(
          v.object({
            name: v.string(),
            activeUntil: v.pipe(
              v.string(),
              v.transform((s) => new Date(s))
            ),
          })
        ),
      })
    ),
  }),
});
