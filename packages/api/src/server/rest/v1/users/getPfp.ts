import * as s3Express from "@/lib/s3+express.js";
import * as s3 from "@/lib/s3.js";
import { toSeconds } from "duration-fns";
import { Router } from "express";

/**
 * Get the Profile Picture (PFP) of a user.
 * @example /v1/users/1/pfp/abc123.png
 */
export default Router().get(
  "/:userId/pfp/:hash:ext(\\.\\w+)?",
  async (req, res) => {
    const s3Key = `users/${req.params.userId}/pfp/${req.params.hash}${req.params.ext}`;
    if (!(await s3.keyExists(s3Key))) return res.sendStatus(404);
    await s3Express.pipe(s3Key, undefined, res, toSeconds({ years: 1 }), {
      range: req.headers.range,
    });
  },
);
