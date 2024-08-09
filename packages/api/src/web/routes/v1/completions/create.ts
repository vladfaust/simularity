import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { omit } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import { MultiCurrencyCostSchema } from "@simularity/api-sdk/common";
import {
  RequestBodySchema,
  ResponseSchema,
} from "@simularity/api-sdk/v1/completions/create";
import bodyParser from "body-parser";
import cors from "cors";
import { and, eq } from "drizzle-orm";
import { toMilliseconds } from "duration-fns";
import { Router } from "express";
import runpodSdk from "runpod-sdk";
import { ensureUser } from "../auth/common.js";

const RunpodResultOutputSchema = v.object({
  id: v.string(),
  choices: v.array(
    v.object({
      finish_reason: v.string(),
      index: v.number(),
      text: v.string(),
    }),
  ),
  model: v.string(),
  system_fingerprint: v.string(),
  object: v.literal("text_completion"),
  usage: v.object({
    completion_tokens: v.number(),
    prompt_tokens: v.number(),
    total_tokens: v.number(),
  }),
});

/**
 * Create a new LLM completion.
 * Put `sessionId` in the `x-session-id` header
 * to continue an existing session.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json())
  .post("/", async (req, res) => {
    const user = await ensureUser(req, res);
    if (!user) return res.sendStatus(401);

    const body = v.safeParse(RequestBodySchema, req.body);
    if (!body.success) {
      konsole.log("Invalid request body", v.flatten(body.issues));
      return res.status(400).json({
        error: "Invalid request body",
        issues: v.flatten(body.issues),
      });
    }

    const worker = await d.db.query.llmWorkers.findFirst({
      where: and(
        eq(d.llmWorkers.providerId, "runpod"),
        eq(d.llmWorkers.enabled, true),
        eq(d.llmWorkers.modelId, body.output.model),
      ),
    });

    if (!worker) {
      konsole.warn("No available worker found", {
        model: body.output.model,
        providerId: "runpod",
      });

      return res.status(503).json({
        error: "No available worker found",
      });
    }

    const runpod = runpodSdk(env.RUNPOD_API_KEY, {
      baseUrl: env.RUNPOD_BASE_URL,
    });

    const endpoint = runpod.endpoint(worker.providerExternalId);
    if (!endpoint) {
      konsole.error("Runpod endpoint unavailable", {
        endpointId: worker.providerExternalId,
      });

      return res.status(503).json({
        error: "No available worker found",
      });
    }

    let sessionId: string | undefined;
    const sessionIdHeader = req.headers["x-session-id"];
    // If there are multiple header values, use the last one.
    if (Array.isArray(sessionIdHeader)) {
      sessionId = sessionIdHeader[sessionIdHeader.length - 1];
    } else if (typeof sessionIdHeader === "string") {
      sessionId = sessionIdHeader;
    }

    let session;

    if (sessionId) {
      session = await d.db.query.llmSessions.findFirst({
        where: eq(d.llmSessions.id, sessionId),
      });

      if (!session) {
        konsole.log("Session not found in DB", { sessionId });
      } else if (session.userId !== user.id) {
        konsole.log("Session not owned by user", {
          sessionId,
          userId: user.id,
          sessionUserId: session.userId,
        });

        session = undefined;
      } else if (session.modelId !== body.output.model) {
        konsole.log("Session model mismatch", {
          sessionId,
          modelId: body.output.model,
          sessionModelId: session.modelId,
        });

        session = undefined;
      }
    }

    if (!session) {
      session = (
        await d.db.insert(d.llmSessions).values({
          userId: user.id,
          modelId: body.output.model,
        })
      )[0];
    }

    let llmCompletion: Pick<typeof d.llmCompletions.$inferSelect, "id">;
    let output: string;
    let usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };

    try {
      const runResult = await endpoint.runSync({
        input: {
          ...omit(body.output, ["model"]),
        },
        policy: {
          executionTimeout: toMilliseconds({
            seconds: 10,
          }),
        },
      });

      if (runResult.status === "SUCCESS") {
        let estimatedCost:
          | v.InferOutput<typeof MultiCurrencyCostSchema>
          | undefined;

        switch (worker.providerPricing?.type) {
          case "perSecond": {
            estimatedCost = {
              [worker.providerPricing.currency]:
                (runResult.executionTime * worker.providerPricing.price) / 1000,
            };
          }
        }

        const parsedOutput = v.safeParse(
          RunpodResultOutputSchema,
          runResult.output,
        );

        if (!parsedOutput.success) {
          // Invalid Runpod result output.
          llmCompletion = (
            await d.db
              .insert(d.llmCompletions)
              .values({
                sessionId: session.id,
                workerId: worker.id,
                params: omit(body.output, ["model", "prompt"]),
                input: body.output.prompt,
                providerExternalId: runResult.id,
                delayTimeMs: runResult.delayTime,
                executionTimeMs: runResult.executionTime,
                error: `Invalid Runpod result output: ${v.flatten(parsedOutput.issues)}`,
                estimatedCost,
              })
              .returning({
                id: d.llmCompletions.id,
              })
          )[0];

          return res.status(500).json({
            error: "Failed to complete request",
            completionId: llmCompletion.id,
          });
        }

        output = parsedOutput.output.choices[0].text;
        usage = {
          promptTokens: parsedOutput.output.usage.prompt_tokens,
          completionTokens: parsedOutput.output.usage.completion_tokens,
          totalTokens: parsedOutput.output.usage.total_tokens,
        };

        // Success.
        llmCompletion = (
          await d.db
            .insert(d.llmCompletions)
            .values({
              sessionId: session.id,
              workerId: worker.id,
              params: omit(body.output, ["model", "prompt"]),
              input: body.output.prompt,
              providerExternalId: runResult.id,
              delayTimeMs: runResult.delayTime,
              executionTimeMs: runResult.executionTime,
              output,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
            })
            .returning({
              id: d.llmCompletions.id,
            })
        )[0];
      } else {
        // Invalid Runpod result status.
        llmCompletion = (
          await d.db
            .insert(d.llmCompletions)
            .values({
              sessionId: session.id,
              workerId: worker.id,
              params: omit(body.output, ["model", "prompt"]),
              input: body.output.prompt,
              providerExternalId: runResult.id,
              delayTimeMs: runResult.delayTime,
              executionTimeMs: runResult.executionTime,
              error: `Invalid Runpod result status: ${runResult.status}`,
            })
            .returning({
              id: d.llmCompletions.id,
            })
        )[0];

        return res.status(500).json({
          error: "Failed to complete request",
          completionId: llmCompletion.id,
        });
      }
    } catch (e: any) {
      // Unexpected error (e.g. network error).
      llmCompletion = (
        await d.db
          .insert(d.llmCompletions)
          .values({
            sessionId: session.id,
            workerId: worker.id,
            params: omit(body.output, ["model", "prompt"]),
            input: body.output.prompt,
            error: e.message,
          })
          .returning({
            id: d.llmCompletions.id,
          })
      )[0];

      return res.status(500).json({
        error: "Failed to complete request",
        completionId: llmCompletion.id,
      });
    }

    return res.status(201).json({
      sessionId: session.id,
      completionId: llmCompletion.id,
      output,
      usage,
    } satisfies v.InferInput<typeof ResponseSchema>);
  });
