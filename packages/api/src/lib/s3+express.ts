import { env } from "@/env.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Response } from "express";
import { s3 } from "./s3.js";

/**
 * Pipe an S3 object to an Express response.
 *
 * @param key S3 object key.
 * @param res Express response.
 * @param cacheMaxAge Cache-Control max-age in seconds.
 * @param options.filename Optional filename for Content-Disposition.
 *
 * @returns {Promise<void>} Resolves when the response has been sent.
 *
 * @throws {Error} If the S3 object does not exist.
 */
export async function pipe(
  key: string,
  versionId: string | undefined,
  res: Response,
  cacheMaxAge: number,
  options?: {
    filename?: string;
  },
): Promise<void> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    VersionId: versionId,
  });

  const response = await s3.send(command);

  res.set("Content-Type", response.ContentType);
  res.set("Content-Length", response.ContentLength?.toString());
  res.set("ETag", response.ETag);
  res.set("Last-Modified", response.LastModified?.toString());

  if (cacheMaxAge) {
    res.set("Cache-Control", `max-age=${cacheMaxAge}`);
  }

  if (options?.filename) {
    res.set(
      "Content-Disposition",
      `attachment; filename="${encodeURI(options.filename)}"`,
    );
  }

  const readableStream = response.Body!.transformToWebStream();

  const writeableStream = new WritableStream({
    write(chunk) {
      res.write(chunk);
    },
    close() {
      res.end();
    },
  });

  return readableStream.pipeTo(writeableStream);
}
