import { env } from "@/env.js";
import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import * as fs from "fs";
import { konsole } from "./konsole.js";

export const s3 = new S3Client({
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
});

/**
 * @returns `true` if the key exists in the bucket.
 */
export async function keyExists(key: string, versionId?: string) {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        VersionId: versionId,
      }),
    );

    return true;
  } catch (error: any) {
    // TODO: Check for known error code.
    return false;
  }
}

/**
 * Get an S3 object as a buffer.
 */
export async function objectToBuffer(
  key: string,
  versionId?: string,
): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    VersionId: versionId,
  });

  const response = await s3.send(command);
  const buffer = await response.Body!.transformToByteArray();

  return Buffer.from(buffer);
}

/**
 * Pipe an S3 object to a file.
 */
export async function objectToFile(key: string, filePath: string) {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  });

  const response = await s3.send(command);
  const readableStream = response.Body!.transformToWebStream();

  const fsStream = fs.createWriteStream(filePath, {
    flags: "w+",
    encoding: "binary",
  });

  const writeableStream = new WritableStream({
    write(chunk) {
      fsStream.write(chunk);
    },
    close() {
      fsStream.end();
    },
  });

  return readableStream.pipeTo(writeableStream);
}

/**
 * Store a buffer in S3.
 */
export async function storeBuffer(key: string, buffer: Buffer | Uint8Array) {
  return s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
    }),
  );
}

/**
 * Store a file in S3.
 */
export async function storeFile(key: string, filePath: string) {
  return s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: fs.createReadStream(filePath),
    }),
  );
}

s3.send(
  new HeadBucketCommand({
    Bucket: env.S3_BUCKET,
  }),
).then(() => {
  konsole.info(`S3 connection OK`);
});
