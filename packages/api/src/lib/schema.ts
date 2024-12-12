import * as v from "valibot";

export * as commands from "./schema/commands.js";
export * as rest from "./schema/rest.js";
export * as scenarios from "./schema/scenarios.js";

export * from "./schema/common.js";

export const TtsParamsSchema = v.strictObject({
  text: v.string(),
  language: v.string(),
  add_wav_header: v.optional(v.boolean()),
  stream_chunk_size: v.optional(v.number()),
  overlap_wav_len: v.optional(v.number()),
  temperature: v.optional(v.number()),
  length_penalty: v.optional(v.number()),
  repetition_penalty: v.optional(v.number()),
  top_k: v.optional(v.number()),
  top_p: v.optional(v.number()),
  do_sample: v.optional(v.boolean()),
  speed: v.optional(v.number()),
  enable_text_splitting: v.optional(v.boolean()),
});

export const OAuthProviderIdSchema = v.picklist(["patreon"]);

export const Text2TextCompletionOptionsSchema = v.strictObject({
  nPrev: v.optional(v.number()),
  nProbs: v.optional(v.number()),
  minKeep: v.optional(v.number()),
  topK: v.optional(v.number()),
  topP: v.optional(v.number()),
  minP: v.optional(v.number()),
  tfsZ: v.optional(v.number()),
  typicalP: v.optional(v.number()),
  temp: v.optional(v.number()),
  dynatemp: v.optional(
    v.object({
      range: v.optional(v.number()),
      exponent: v.optional(v.number()),
    }),
  ),
  penalty: v.optional(
    v.object({
      lastN: v.optional(v.number()),
      repeat: v.optional(v.number()),
      freq: v.optional(v.number()),
      present: v.optional(v.number()),
      penalizeNl: v.optional(v.boolean()),
    }),
  ),
  mirostat: v.optional(
    v.object({
      version: v.picklist(["v1", "v2"]),
      tau: v.optional(v.number()),
      eta: v.optional(v.number()),
    }),
  ),
  seed: v.optional(v.number()),
  stopSequences: v.optional(v.array(v.string())),
  grammar: v.optional(
    v.object({
      lang: v.union([
        v.literal("gbnf"),
        v.literal("lark"),
        v.literal("regex"),
        v.literal("json-schema"),
        v.literal("lua-gbnf"),
      ]),
      content: v.string(),
    }),
  ),
});

export type Text2TextCompletionOptions = v.InferOutput<
  typeof Text2TextCompletionOptionsSchema
>;

export const SubscriptionTierSchema = v.union([
  v.literal("basic"),
  v.literal("premium"),
]);
export type SubscriptionTier = v.InferOutput<typeof SubscriptionTierSchema>;

export const PatreonTier = v.object({
  id: v.string(),
  name: v.string(),
  subscriptionTier: SubscriptionTierSchema,
});

export const LlmModelTaskSchema = v.union([
  v.literal("writer"),
  v.literal("director"),
]);

export const PlatformIdSchema = v.union([
  v.literal("windows-x86_64"),
  v.literal("darwin-arm64"),
]);

export type PlatformId = v.InferOutput<typeof PlatformIdSchema>;

/**
 * @see https://v2.tauri.app/plugin/updater/#static-json-file.
 */
export const ReleaseSchema = v.object({
  /**
   * Must be a valid SemVer, with or without a leading `v`,
   * meaning that both `1.0.0` and `v1.0.0` are valid.
   */
  version: v.pipe(
    v.string(),
    v.check(
      (x) => /^v?\d+\.\d+\.\d+$/.test(x),
      "must be a valid SemVer, with or without a leading v",
    ),
  ),

  /**
   * Notes about the update.
   */
  notes: v.string(),

  /**
   * The date must be formatted according to RFC 3339 if present.
   */
  pub_date: v.optional(
    v.pipe(
      v.string(),
      v.check(
        (x) => new Date(x).toISOString() === x,
        "must be formatted according to RFC 3339",
      ),
    ),
  ),

  /**
   * Each platform key is in the `OS-ARCH` format, where `OS`
   * is one of `linux`, `darwin` or `windows`, and `ARCH`
   * is one of `x86_64`, `aarch64`, `i686` or `armv7`.
   */
  platforms: v.record(
    PlatformIdSchema,
    v.object({
      /**
       * The content of the generated `.sig` file, which may change
       * with each build. A path or URL does not work!
       */
      signature: v.string(),

      url: v.pipe(v.string(), v.url()),
    }),
  ),
});

export type Release = v.InferOutput<typeof ReleaseSchema>;
