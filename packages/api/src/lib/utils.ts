import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/**
 * @author https://stackoverflow.com/a/56592365/3645337
 */
export const pick = <T extends {}, K extends keyof T>(obj: T, keys: Array<K>) =>
  Object.fromEntries(
    keys.filter((key) => key in obj).map((key) => [key, obj[key]]),
  ) as Pick<T, K>;

/**
 * @author https://stackoverflow.com/a/56592365/3645337
 */
export const omit = <T extends {}, K extends keyof T>(obj: T, keys: Array<K>) =>
  Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keys.includes(key as K)),
  ) as Omit<T, K>;

export function safeParseJson(json: string) {
  try {
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

/**
 * Create an AbortSignal that will be aborted after the given timeout.
 */
export function timeoutSignal(timeout: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);
  return controller.signal;
}

export async function sha256File(filepath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filepath);

  return new Promise((resolve, reject) => {
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Would panic upon non-exhaustive-ness.
 * @example default: unreachable(case)
 */
export function unreachable(arg: never) {
  return arg;
}

/**
 * Remove empty-after-trimming strings from an array of strings.
 */
export function filterWhitespaceStrings(strings: string[]): string[] {
  return strings.filter((s) => s.trim().length);
}

/**
 * Sleep for the given number of milliseconds.
 */
export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type JSONValue =
  | string
  | number
  | boolean
  | { [x: string]: JSONValue }
  | JSONValue[];

function truncateLongJsonValueStrings(
  value: JSONValue,
  maxLength: number,
): JSONValue {
  if (typeof value === "string") {
    return value.length > maxLength
      ? value.slice(0, maxLength) + "[...]"
      : value;
  } else if (Array.isArray(value)) {
    return value.map((item) => truncateLongJsonValueStrings(item, maxLength));
  } else if (typeof value === "object" && value !== null) {
    const trimmedObj: { [key: string]: JSONValue } = {};

    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        trimmedObj[key] = truncateLongJsonValueStrings(value[key], maxLength);
      }
    }

    return trimmedObj;
  } else {
    return value;
  }
}

/**
 * Stringify a object, truncating long strings to the given length.
 */
export function stringifyTrimmed(
  jsonObj: JSONValue,
  maxLength: number = 32,
  spacing: number = 2,
): string {
  const truncatedObj = truncateLongJsonValueStrings(jsonObj, maxLength);
  return JSON.stringify(truncatedObj, null, spacing);
}
