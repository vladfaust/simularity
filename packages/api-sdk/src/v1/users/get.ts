import * as v from "valibot";

export const ResponseSchema = v.object({
  id: v.string(),
  username: v.string(),
});
