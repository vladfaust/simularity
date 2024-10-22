import { env } from "@/env";
import { d } from "@/lib/drizzle";
import { Release } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { Router } from "express";

/**
 * Get release JSON for the latest version.
 * @example fetch(`/rest/v1/releases/latest.json`)
 */
export default Router().get("/latest.json", async (req, res) => {
  const latestRelease = await d.db.query.releases.findFirst({
    orderBy: [
      desc(d.releases.versionMajor),
      desc(d.releases.versionMinor),
      desc(d.releases.versionPatch),
    ],
  });

  if (!latestRelease) {
    return res.status(404).json({ error: "No releases found" });
  }

  const version = `v${latestRelease.versionMajor}.${latestRelease.versionMinor}.${latestRelease.versionPatch}`;

  // See https://v2.tauri.app/plugin/updater/#static-json-file.
  res.json({
    version,
    notes: latestRelease.notes ?? "",
    pub_date: latestRelease.createdAt.toISOString(),
    platforms: Object.fromEntries(
      Object.entries(latestRelease.platforms).map(
        ([platform, { signature }]) => [
          platform,
          {
            signature,
            url: `${env.BASE_URL}/rest/v1/releases/${version}/${platform}`,
          },
        ],
      ),
    ),
  } satisfies Release);
});
