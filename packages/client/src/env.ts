import { v } from "./lib/valibot";

function envBool() {
  return v.pipe(
    v.string(),
    v.toLowerCase(),
    v.check(
      (x) => ["1", "0", "true", "false"].includes(x),
      `must be one of "1", "0", "true", "false"`,
    ),
    v.transform((x) => {
      switch (x) {
        case "1":
        case "true":
          return true;
        case "0":
        case "false":
          return false;
        default:
          throw new Error("(BUG) Unreachable");
      }
    }),
  );
}

const env = v.parse(
  v.object({
    VITE_EXPERIMENTAL_FEATURES: envBool(),
  }),
  import.meta.env,
);

export { env };
