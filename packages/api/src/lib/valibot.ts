import * as v from "valibot";
export { v };

/**
 * Similar to {@link v.parse}, but also type-checks that `value` satisfies.
 */
export function parseTyped<
  T extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(schema: T, value: v.InferInput<T>): v.InferOutput<T> {
  return v.parse(schema, value);
}
