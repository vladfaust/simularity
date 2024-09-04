import { v } from "../valibot.js";

const DateSchema = v.pipe(
  v.string(),
  v.transform((x) => new Date(x)),
);

export const TokenResponseSchema = v.object({
  access_token: v.string(),
  refresh_token: v.string(),
  expires_in: v.number(),
  scope: v.string(),
  token_type: v.string(),
});

export const UserV2Schema = v.object({
  id: v.string(),
  type: v.literal("user"),
  attributes: v.object({
    /** The user's about text, which appears on their profile. */
    about: v.optional(v.nullable(v.string())),

    /** true if this user can view nsfw content. */
    can_see_nsfw: v.optional(v.nullable(v.boolean())),

    /** Datetime of this user's account creation. */
    created: v.optional(DateSchema),

    /**
     * The user's email address.
     * Requires certain scopes to access.
     * See the scopes section of this documentation.
     */
    email: v.optional(v.string()),

    /** First name. */
    first_name: v.optional(v.nullable(v.string())),

    /** Combined first and last name. */
    full_name: v.optional(v.string()),

    /** true if the user has chosen to keep private which creators they pledge to. */
    hide_pledges: v.optional(v.nullable(v.boolean())),

    /** The user's profile picture URL, scaled to width 400px. */
    image_url: v.optional(v.string()),

    /** true if the user has confirmed their email. */
    is_email_verified: v.optional(v.boolean()),

    /** Last name. */
    last_name: v.optional(v.nullable(v.string())),

    /** How many posts this user has liked. */
    like_count: v.optional(v.number()),

    /**
     * Mapping from user's connected app names
     * to external user id on the respective app.
     */
    social_connections: v.optional(
      v.object({
        discord: v.nullable(v.string()),
      }),
    ),

    /** The user's profile picture URL, scaled to a square of size 100x100px. */
    thumb_url: v.optional(v.string()),

    /** URL of this user's creator or patron profile. */
    url: v.optional(v.nullable(v.string())),

    /**
     * The public "username" of the user.
     * patreon.com/ goes to this user's creator page.
     * Non-creator users might not have a vanity.
     * [Deprecated! use campaign.vanity]
     */
    vanity: v.optional(v.nullable(v.string())),
  }),
});

export const PledgeSchema = v.object({
  id: v.string(),
  type: v.literal("pledge"),
  attributes: v.object({
    /** Amount (in the currency in which the patron paid) of the underlying event. */
    amount_cents: v.number(),

    /** The date which this event occurred. */
    created_at: DateSchema,

    /** ISO code of the currency of the event. */
    currency: v.string(),

    declined_since: v.nullable(DateSchema),

    /**
     * Always null or false.
     * @see https://www.patreondevelopers.com/t/how-does-the-patreon-system-work-decline-payments-outstanding-amounts-etc/131/3.
     */
    patron_pays_fees: v.nullable(v.boolean()),

    pledge_cap_cents: v.nullable(v.number()),

    total_historical_amount_cents: v.optional(v.number()),
    is_paused: v.optional(v.boolean()),

    /** The status of this pledge. */
    status: v.optional(
      v.picklist(["valid", "declined", "pending", "disabled"]),
    ),

    has_shipping_address: v.optional(v.boolean()),
  }),
  relationships: v.object({
    campaign: v.object({
      data: v.object({
        id: v.string(),
      }),
    }),

    patron: v.object({
      data: v.object({
        id: v.string(),
      }),
    }),

    reward: v.object({
      data: v.object({
        id: v.string(),
      }),
    }),
  }),
});
