import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import * as s3 from "@/lib/s3.js";
import { v } from "@/lib/valibot.js";
import { getAuthenticatedUserId } from "@/server/_common";
import busboy from "busboy";
import { eq } from "drizzle-orm";
import { Router } from "express";

const RequestBodySchema = v.object({
  pfp: v.optional(
    v.pipe(
      v.instance(File),
      v.mimeType(["image/jpeg", "image/png"]),
      v.maxSize(1024 * 1024 * 2), // 2 MB.
    ),
  ),
  bgp: v.optional(
    v.pipe(
      v.instance(File),
      v.mimeType(["image/jpeg", "image/png"]),
      v.maxSize(1024 * 1024 * 2), // 2 MB.
    ),
  ),
  username: v.optional(v.pipe(v.string(), v.minLength(3), v.maxLength(32))),
  bio: v.optional(v.pipe(v.string(), v.minLength(0), v.maxLength(256))),
});

export default Router().put("/", async (req, res) => {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return res.sendStatus(401);

  const user = await d.db.query.users.findFirst({
    where: eq(d.users.id, userId),
  });

  if (!user) {
    throw new Error(`Authenticated user not found: ${userId}`);
  }

  const unprocessedBody: v.InferInput<typeof RequestBodySchema> = {};

  const bb = busboy({ headers: req.headers });
  bb.on("file", (name, file, info) => {
    const { filename, encoding, mimeType } = info;

    console.log(
      `File [${name}]: filename: %j, encoding: %j, mimeType: %j`,
      filename,
      encoding,
      mimeType,
    );

    if (name !== "pfp" && name !== "bgp") {
      konsole.warn("Unexpected file field", { name });
      file.resume();
      return;
    }

    const chunks: Buffer[] = [];

    file
      .on("data", (data) => {
        console.log(`File [${name}] got ${data.length} bytes`);
        chunks.push(data);
      })
      .on("close", () => {
        console.log(`File [${name}] done`);
        unprocessedBody[name] = new File(chunks, filename, {
          type: mimeType,
        });
      });
  });

  bb.on("field", (name, val, info) => {
    console.log(`Field [${name}]: value: %j`, val);

    if (name !== "username" && name !== "bio") {
      konsole.warn("Unexpected field", { name });
      return;
    }

    unprocessedBody[name] = val;
  });

  const done = new Promise((resolve) => bb.on("close", resolve));
  req.pipe(bb);
  await done;

  const body = v.safeParse(RequestBodySchema, unprocessedBody);
  if (!body.success) {
    konsole.log("Invalid request body", v.flatten(body.issues));
    return res.status(400).json({
      error: "Invalid request body",
      issues: v.flatten(body.issues),
    });
  }
  konsole.debug("Parsed request body", body.output);

  if (body.output.username) {
    const existingUser = await d.db.query.users.findFirst({
      where: eq(d.users.username, body.output.username),
    });

    if (existingUser) {
      konsole.debug("Username already exists", {
        username: body.output.username,
      });

      return res.status(409).json({
        error: "Username already exists",
        username: body.output.username,
      });
    }
  }

  const fileUploadPromises: Promise<any>[] = [];

  async function storeFile(
    kind: "pfp" | "bgp",
    userId: string,
    file: File,
    storedHash: Buffer | null,
  ): Promise<{
    hash: Buffer;
    extension: string | null;
  } | null> {
    const hash = Buffer.from(
      await crypto.subtle.digest(
        "SHA-256",
        Buffer.from(await file.arrayBuffer()),
      ),
    );

    if (!storedHash || !storedHash.equals(hash)) {
      const extension = file.name.split(".").pop() ?? null;
      const s3Key = `users/${userId}/${kind}/${hash.toString("hex")}${extension ? `.${extension}` : ""}`;

      fileUploadPromises.push(
        (async () => {
          konsole.log("Storing file", {
            kind,
            key: s3Key,
            size: file.size,
            hash: hash.toString("hex"),
          });

          await s3.storeBuffer(s3Key, Buffer.from(await file.arrayBuffer()));
        })(),
      );

      return { hash, extension };
    } else {
      return null;
    }
  }

  let newPfpHash: Buffer | undefined;
  let newPfpExtension: string | null | undefined;

  if (body.output.pfp) {
    const result = await storeFile(
      "pfp",
      user.id,
      body.output.pfp,
      user.pfpHash,
    );
    if (result) {
      newPfpHash = result.hash;
      newPfpExtension = result.extension;
    }
  }

  let newBgpHash: Buffer | undefined;
  let newBgpExtension: string | null | undefined;

  if (body.output.bgp) {
    const result = await storeFile(
      "bgp",
      user.id,
      body.output.bgp,
      user.bgpHash,
    );

    if (result) {
      newBgpHash = result.hash;
      newBgpExtension = result.extension;
    }
  }

  await Promise.all(fileUploadPromises);

  if (
    body.output.username === undefined &&
    body.output.bio === undefined &&
    !newPfpHash &&
    !newBgpHash
  ) {
    return res.status(400).json({
      error: "Nothing to update",
    });
  }

  konsole.log("Updating user", {
    id: user.id,
    username: body.output.username,
    bio: body.output.bio,
    newPfpHash,
    newPfpExtension,
    newBgpHash,
    newBgpExtension,
  });

  await d.db
    .update(d.users)
    .set({
      username: body.output.username,
      bio: body.output.bio,
      pfpHash: newPfpHash,
      pfpExtension: newPfpExtension,
      bgpHash: newBgpHash,
      bgpExtension: newBgpExtension,
    })
    .where(eq(d.users.id, user.id));

  return res.sendStatus(204);
});
