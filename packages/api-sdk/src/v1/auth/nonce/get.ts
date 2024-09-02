import * as v from "valibot";

export const ResponseSchema = v.object({
  jwt: v.string(),
});
