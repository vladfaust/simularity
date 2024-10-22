import { env } from "@/env";
import { d } from "@/lib/drizzle";
import { Release } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { Router } from "express";

/**
 * Get release JSON for a specific version.
 * @example fetch(`/rest/v1/releases/v1.2.3.json`)
 */
export default Router().get(
  "/v:version(\\d+\\.\\d+\\.\\d+).json",
  async (req, res) => {
    const [minor, major, patch] = req.params.version.split(".").map(Number);

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

    const version = `v${release.versionMajor}.${release.versionMinor}.${release.versionPatch}`;

    res.json({
      version,
      notes: release.notes ?? "",
      pub_date: release.createdAt.toISOString(),
      platforms: Object.fromEntries(
        Object.entries(release.platforms).map(([platform, { signature }]) => [
          platform,
          {
            signature,
            url: `${env.BASE_URL}/rest/v1/releases/${version}/${platform}`,
          },
        ]),
      ),
    } satisfies Release);
  },
);
