import { v } from "./lib/valibot";

const env = v.parse(
  v.object({
    VITE_API_BASE_URL: v.pipe(v.string(), v.url()),
    VITE_PATREON_CAMPAIGN_URL: v.pipe(v.string(), v.url()),
    VITE_DISCORD_URL: v.optional(v.pipe(v.string(), v.url())),
    VITE_REDDIT_URL: v.optional(v.pipe(v.string(), v.url())),
    VITE_X_URL: v.optional(v.pipe(v.string(), v.url())),
  }),
  import.meta.env,
);

export { env };
