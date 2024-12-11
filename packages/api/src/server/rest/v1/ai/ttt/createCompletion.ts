import { d } from "@/lib/drizzle";
import { konsole } from "@/lib/konsole";
import {
  CoreTttEndpoint,
  CoreTttEndpointInputSchema,
} from "@/lib/runpod/endpoints/core-ttt";
import {
  VllmEndpoint,
  VllmEndpointInputSchema,
} from "@/lib/runpod/endpoints/vllm";
import * as schema from "@/lib/schema/rest/v1/ai/ttt/createCompletion";
import { omit, unreachable } from "@/lib/utils";
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

    const workerConditions = [
      eq(d.llmWorkers.enabled, true),
      eq(d.llmWorkers.modelId, input.model),
    ];

    const grammarLang = input.options?.grammar?.lang;
    switch (grammarLang) {
      case "gbnf":
      case "lua-gbnf":
        konsole.log("Searching for a runpod-core worker", { grammarLang });
        workerConditions.push(eq(d.llmWorkers.providerId, "runpod-core"));
        break;
      case "json-schema":
      case "lark":
      case "regex":
        konsole.log("Searching for a runpod-vllm worker", { grammarLang });
        workerConditions.push(eq(d.llmWorkers.providerId, "runpod-vllm"));
        break;
      case undefined:
        konsole.log("Searching for any worker", { grammarLang });
        break;
      default:
        throw unreachable(grammarLang);
    }

    const worker = await d.db.query.llmWorkers.findFirst({
      where: and(...workerConditions),
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

    const endpointClass =
      worker.providerId === "runpod-core" ? CoreTttEndpoint : VllmEndpoint;

    const endpoint = endpointClass.create(user.id, worker);
    if (!endpoint) {
      konsole.error("Runpod endpoint unavailable", {
        meta: worker.providerMeta,
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
            providerSessionId: d.llmSessions.providerSessionId,
          })
      )[0];
    }

    konsole.debug("Session", session);
    res.header("x-session-id", session.id);

    let endpointInput;
    switch (worker.providerId) {
      case "runpod-core":
        endpointInput = {
          session_id: session.providerSessionId
            ? parseInt(session.providerSessionId)
            : undefined,
          prompt: input.prompt,
          n_eval: input.nEval,
          options: {
            ...input.options,
            grammar:
              input.options?.grammar?.lang === "gbnf"
                ? input.options?.grammar.content
                : undefined,
            lua_grammar:
              input.options?.grammar?.lang === "lua-gbnf"
                ? input.options?.grammar.content
                : undefined,
          },
        } satisfies v.InferInput<typeof CoreTttEndpointInputSchema>;

        konsole.debug(
          "Core-TTT RunPod endpoint input",
          omit(
            {
              ...endpointInput,
              options: {
                ...endpointInput.options,
                grammar: endpointInput.options?.grammar?.length,
                lua_grammar: endpointInput.options?.lua_grammar?.length,
              },
            },
            ["prompt"],
          ),
        );

        break;

      case "runpod-vllm":
        endpointInput = {
          prompt: input.prompt,
          sampling_params: {
            max_tokens: input.nEval,
            presence_penalty: input.options?.penalty?.present,
            stop: input.options?.stopSequences,
            temperature: input.options?.temp,
            top_p: input.options?.topP,
            top_k: input.options?.topK,
            min_p: input.options?.minP,
            repetition_penalty: input.options?.penalty?.repeat,
          },
          guided_options_request: input.options?.grammar
            ? {
                guided_grammar:
                  input.options.grammar.lang === "lark"
                    ? input.options.grammar.content
                    : undefined,
                guided_json:
                  input.options.grammar.lang === "json-schema"
                    ? input.options.grammar.content
                    : undefined,
                guided_regex:
                  input.options.grammar.lang === "regex"
                    ? input.options.grammar.content
                    : undefined,
              }
            : undefined,
        } satisfies v.InferInput<typeof VllmEndpointInputSchema>;

        konsole.debug(
          "vLLM RunPod endpoint input",
          omit(endpointInput, ["prompt"]),
        );

        break;

      default:
        throw unreachable(worker.providerId);
    }

    try {
      const llmCompletion = await endpoint.run(
        session.id,
        endpointInput as any, // FIXME: Remove this cast.
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
