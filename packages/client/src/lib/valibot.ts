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

/**
 * Pretty-format validation issues.
 *
 * @example
 * // => "At \"proto\": Invalid type: Expected string but received undefined"
 */
export function formatIssues(
  issues: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]],
) {
  const flatErrors = v.flatten(issues);
  let text = "";

  if (flatErrors.nested) {
    text += Object.entries(flatErrors.nested)
      .map(
        ([path, errors]) =>
          `At "${path}": ${(errors as string[] | undefined)?.join(", ")}`,
      )
      .join("; ");
  }

  return text;
}
