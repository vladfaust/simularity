import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { FetchError, ResponseOkError } from "@/lib/errors.js";
import * as inferenceNodeApi from "@/lib/inferenceNodeApi.js";
import { konsole } from "@/lib/konsole.js";
import { timeoutSignal, unreachable } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import bodyParser from "body-parser";
import cors from "cors";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { toMilliseconds } from "duration-fns";
import { Router } from "express";
import pRetry from "p-retry";
import { findInferenceNode } from "./_common.js";

const RequestBodySchema = v.object({
  model: v.string(),

  /**
   * If set, would try loading the GPT session
   * from prompt's hash, otherwise decode from scratch.
   */
  initialPrompt: v.optional(v.string()),
});

const ErrorChunkSchema = v.object({
  type: v.literal("error"),
  error: v.string(),
});

const ProgressChunkSchema = v.object({
  type: v.literal("progress"),
  progress: v.number(), // 0-1
});

const EpilogueChunkSchema = v.object({
  type: v.literal("epilogue"),
  sessionId: v.string(),
  contextLength: v.number(),
});

/**
 * Create a new GPT session.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json())
  .post("/gpts", async (req, res, next) => {
    const body = v.safeParse(RequestBodySchema, req.body);
    if (!body.success) {
      konsole.log("Invalid request body to /gpts", v.flatten(body.issues));
      return res.status(400).json({
        error: "Invalid request body",
        issues: v.flatten(body.issues),
      });
    }

    const node = await findInferenceNode(body.output.model);
    if (!node) {
      konsole.warn("No inference node available");
      return res.status(503).send("No inference node available for this model");
    }

    let dumpSession: boolean | undefined;
    if (body.output.initialPrompt) {
      const promptHash = createHash("sha256")
        .update(body.output.initialPrompt)
        .digest();

      dumpSession =
        env.ALLOW_ALL_SESSION_CACHE ||
        !!(await d.db.query.gptSessionHashes.findFirst({
          where: eq(d.gptSessionHashes.hash, promptHash),
        }));

      if (dumpSession) {
        konsole.log("Will dump session", {
          promptHash: promptHash.toString("hex"),
        });
      } else {
        konsole.info("Prompt's session hash not whitelisted", {
          promptHash: promptHash.toString("hex"),
        });
      }
    }

    const result = await pRetry(
      async () => {
        for await (const chunk of inferenceNodeApi.create(
          node.baseUrl,
          {
            modelId: body.output.model,
            initialPrompt: body.output.initialPrompt,
            dumpSession,
          },
          { abortSignal: timeoutSignal(toMilliseconds({ minutes: 5 })) },
        )) {
          switch (chunk.type) {
            case "Error":
              res.write(
                JSON.stringify({
                  type: "error",
                  error: chunk.error,
                } satisfies v.InferOutput<typeof ErrorChunkSchema>) + "\n",
              );

              return;
            case "Progress":
              res.write(
                JSON.stringify({
                  type: "progress",
                  progress: chunk.progress,
                } satisfies v.InferOutput<typeof ProgressChunkSchema>) + "\n",
              );

              break;
            case "Epilogue":
              return chunk;
            default:
              throw unreachable(chunk);
          }
        }

        throw new Error("Inference node did not return epilogue");
      },
      {
        retries: 2,
        onFailedAttempt: (error) => {
          if (error instanceof FetchError || error instanceof ResponseOkError) {
            konsole.warn(
              `Inference node /create call error (${error.retriesLeft} retries left)`,
              error,
            );
          } else {
            throw error;
          }
        },
      },
    );

    if (!result) {
      res.end();
      return;
    }

    const session = (
      await d.db
        .insert(d.gptSessions)
        .values({
          inferenceNodeId: node.id,
          inferenceNodeSessionId: result.sessionId,
          model: body.output.model,
          initialPrompt: body.output.initialPrompt,
        })
        .returning({
          id: d.gptSessions.id,
        })
    )[0];
    konsole.info("Created GPT session", session);

    res.write(
      JSON.stringify({
        type: "epilogue",
        sessionId: session.id,
        contextLength: result.contextLength,
      } satisfies v.InferOutput<typeof EpilogueChunkSchema>) + "\n",
    );

    res.end();
  });
