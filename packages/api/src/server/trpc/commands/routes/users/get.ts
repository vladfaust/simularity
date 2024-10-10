import { d } from "@/lib/drizzle.js";
import { v } from "@/lib/valibot.js";
import { t } from "@/server/trpc";
import { wrap } from "@typeschema/valibot";
import { eq } from "drizzle-orm";

/**
 * Get a user's profile.
 */
export default t.procedure
  .input(
    wrap(
      v.object({
        userId: v.string(),
      }),
    ),
  )
  .output(
    wrap(
      v.nullable(
        v.object({
          id: v.string(),

          username: v.nullable(v.string()),
          bio: v.string(),

          pfp: v.nullable(
            v.object({
              hash: v.string(),
              extension: v.string(),
            }),
          ),

          bgp: v.nullable(
            v.object({
              hash: v.string(),
              extension: v.string(),
            }),
          ),
        }),
      ),
    ),
  )
  .query(async ({ input }) => {
    const user = await d.db.query.users.findFirst({
      where: eq(d.users.id, input.userId),
    });

    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      bio: user.bio,

      pfp: user.pfpHash
        ? {
            hash: user.pfpHash.toString("hex"),
            extension: user.pfpExtension!,
          }
        : null,

      bgp: user.bgpHash
        ? {
            hash: user.bgpHash.toString("hex"),
            extension: user.bgpExtension!,
          }
        : null,
    };
  });
