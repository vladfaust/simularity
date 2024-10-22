import { d } from "@/lib/drizzle";
import { pipe } from "@/lib/s3+express";
import { PlatformId, PlatformIdSchema } from "@/lib/schema";
import { unreachable } from "@/lib/utils";
import { v } from "@/lib/valibot";
import { and, eq } from "drizzle-orm";
import { toSeconds } from "duration-fns";
import { Router } from "express";

/**
 * Serve a specific binary release.
 * Sets the `Content-Disposition` header to suggest a filename.
 * @example fetch(`/rest/v1/releases/v1.2.3/windows-x86_64`)
 */
export default Router().get(
  "/v:version(\\d+\\.\\d+\\.\\d+)/:platformId",
  async (req, res) => {
    const [major, minor, patch] = req.params.version.split(".").map(Number);

    const release = await d.db.query.releases.findFirst({
      where: and(
        eq(d.releases.versionMajor, major),
        eq(d.releases.versionMinor, minor),
        eq(d.releases.versionPatch, patch),
      ),
    });

    if (!release) {
      return res
        .status(404)
        .json({ error: `Release not found: ${req.params.version}` });
    }

    const platformIdParseResult = v.safeParse(
      PlatformIdSchema,
      req.params.platformId,
    );
    if (!platformIdParseResult.success) {
      return res
        .status(404)
        .json({ error: `Platform not found: ${req.params.platformId} (1)` });
    }
    const platformId = platformIdParseResult.output;

    const platform = release.platforms[platformId];
    if (!platform) {
      return res
        .status(404)
        .json({ error: `Platform not found: ${req.params.platform} (2)` });
    }

    return pipe(
      platform.s3ObjectKey,
      platform.s3ObjectVersion,
      res,

      // Cache for one year.
      toSeconds({ years: 1 }),

      {
        // E.g. `simularity-windows-x86_64-v1.2.3.exe`.
        filename: `simularity-${platformId}-v${
          release.versionMajor
        }.${release.versionMinor}.${release.versionPatch}.${extensionByPlatformId(
          platformId,
        )}`,
      },
    );
  },
);

function extensionByPlatformId(platformId: PlatformId): string {
  switch (platformId) {
    case "windows-x86_64":
      return "exe";
    case "darwin-arm64":
      return "dmg";
    default:
      throw unreachable(platformId);
  }
}
