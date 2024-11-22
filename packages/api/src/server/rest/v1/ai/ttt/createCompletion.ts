import { d } from "@/lib/drizzle";
import { konsole } from "@/lib/konsole";
import {
  VllmEndpoint,
  VllmEndpointInputSchema,
} from "@/lib/runpod/endpoints/vllm";
import * as schema from "@/lib/schema/rest/v1/ai/ttt/createCompletion";
import { omit, pick } from "@/lib/utils";
import { v } from "@/lib/valibot";
import { getAuthenticatedUserId } from "@/server/_common";
import assert from "assert";
import bodyParser from "body-parser";
import cors from "cors";
import { and, eq, gte, sql } from "drizzle-orm";
import { Router } from "express";

export default Router()
  .use(
    cors({
      exposedHeaders: ["x-session-id"],
      allowedHeaders: ["x-session-id"],
    }),
  )
  .use(
    bodyParser.json({
      limit: "1mb",
    }),
  )
  .post("/", async (req, res) => {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.sendStatus(401);

    const user = await d.db.query.users.findFirst({
      where: eq(d.users.id, userId),
    });

    if (!user) {
      throw new Error(`Authenticated user not found: ${userId}`);
    }

    const parseResult = v.safeParse(schema.RequestBodySchema, req.body);
    if (!parseResult.success) {
      const issues = v.flatten(parseResult.issues);
      konsole.debug("Invalid request body", issues);
      return res.status(400).json({ issues });
    }

    const input = parseResult.output;

    const model = await d.db.query.llmModels.findFirst({
      where: eq(d.llmModels.id, input.model),
      columns: {
        id: true,
        requiredSubscriptionTier: true,
      },
    });

    if (!model) {
      konsole.warn("Model not found", input.model);

      return res.status(400).json({
        error: "Model not found",
      });
    }

    if (model.requiredSubscriptionTier) {
      const subscription = d.db.query.subscriptions.findFirst({
        where: and(
          eq(d.subscriptions.userId, user.id),
          eq(d.subscriptions.tier, model.requiredSubscriptionTier),
          gte(d.subscriptions.activeUntil, sql`now()`),
        ),
      });

      if (!subscription) {
        konsole.log("Subscription required", {
          userId: user.id,
          tier: model.requiredSubscriptionTier,
        });

        return res.status(402).json({
          error: `Subscription required: ${model.requiredSubscriptionTier}`,
        });
      }
    }

    const worker = await d.db.query.llmWorkers.findFirst({
      where: and(
        eq(d.llmWorkers.providerId, "runpod"),
        eq(d.llmWorkers.enabled, true),
        eq(d.llmWorkers.modelId, input.model),
      ),
    });

    if (!worker) {
      konsole.log("No available worker found", {
        model: input.model,
        providerId: "runpod",
      });

      return res.status(503).json({
        error: "No available worker found",
      });
    }

    const endpoint = VllmEndpoint.create(user.id, worker);
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
      } else if (session.modelId !== input.model) {
        konsole.log("Session model mismatch", {
          sessionId,
          modelId: input.model,
          sessionModelId: session.modelId,
        });

        session = undefined;
      }
    }

    if (!session) {
      session = (
        await d.db
          .insert(d.llmSessions)
          .values({
            userId: user.id,
            modelId: input.model,
          })
          .returning({
            id: d.llmSessions.id,
          })
      )[0];
    }

    konsole.debug("Session", session);
    res.header("x-session-id", session.id);

    const llmInput = {
      prompt: input.prompt,
      sampling_params: pick(input, [
        // OpenAI-compatible.
        "max_tokens",
        "presence_penalty",
        "stop",
        "temperature",
        "top_p",

        // vLLM-specific.
        "top_k",
        "min_p",
        "repetition_penalty",
        "stop_token_ids",
        "include_stop_str_in_output",
        "min_tokens",
      ]),

      // vLLM-specific.
      guided_options_request: pick(input, [
        "guided_grammar",
        "guided_regex",
        "guided_json",
      ]),
    } satisfies v.InferInput<typeof VllmEndpointInputSchema>;
    konsole.debug("vLLM endpoint input", omit(llmInput, ["prompt"]));

    try {
      const llmCompletion = await endpoint.run(
        session.id,
        llmInput,
        (tokens) => {
          res.write(
            JSON.stringify({
              done: false,
              tokens,
            } satisfies v.InferOutput<typeof schema.InferenceChunkSchema>) +
              "\n",
          );
        },
      );

      if (llmCompletion.error) {
        return res.status(500).json({
          error: llmCompletion.error,
        });
      } else {
        assert(llmCompletion.output !== null);
        assert(llmCompletion.completionTokens !== null);
        assert(llmCompletion.delayTimeMs !== null);
        assert(llmCompletion.executionTimeMs !== null);
        assert(llmCompletion.promptTokens !== null);

        res.write(
          JSON.stringify({
            done: true,
            completionId: llmCompletion.id,
            usage: {
              completionTokens: llmCompletion.completionTokens,
              delayTime: llmCompletion.delayTimeMs,
              executionTime: llmCompletion.executionTimeMs,
              promptTokens: llmCompletion.promptTokens,
              totalTokens:
                llmCompletion.promptTokens + llmCompletion.completionTokens,
            },
          } satisfies v.InferOutput<typeof schema.EpilogueSchema>) + "\n",
        );

        return res.end();
      }
    } catch (e: any) {
      konsole.error("Failed to complete request", e);

      return res.status(500).json({
        error: "Failed to complete request",
      });
    }
  });
