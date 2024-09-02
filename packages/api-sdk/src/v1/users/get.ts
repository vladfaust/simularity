import * as v from "valibot";

export const ResponseSchema = v.object({
  id: v.string(),
  email: v.nullable(v.string()),
});
