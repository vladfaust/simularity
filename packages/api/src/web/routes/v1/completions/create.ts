import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import {
  VllmEndpoint,
  VllmEndpointInputSchema,
} from "@/lib/runpod/endpoints/vllm.js";
import { omit, pick } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import {
  RequestBodySchema,
  ResponseSchema,
} from "@simularity/api-sdk/v1/completions/create";
import assert from "assert";
import bodyParser from "body-parser";
import cors from "cors";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { ensureUser } from "../auth/common.js";

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

    const endpoint = VllmEndpoint.create(worker);
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
        await d.db
          .insert(d.llmSessions)
          .values({
            userId: user.id,
            modelId: body.output.model,
          })
          .returning({
            id: d.llmSessions.id,
          })
      )[0];
    }

    konsole.debug("Session", session);

    const input = {
      prompt: body.output.prompt,
      sampling_params: pick(body.output, [
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
      guided_options_request: pick(body.output, [
        "guided_grammar",
        "guided_regex",
        "guided_json",
      ]),
    } satisfies v.InferInput<typeof VllmEndpointInputSchema>;
    konsole.debug("vLLM endpoint input", omit(input, ["prompt"]));

    const llmCompletion = await endpoint.run(session.id, input);

    if (llmCompletion.error) {
      konsole.error("Failed to complete request", {
        completionId: llmCompletion.id,
        error: llmCompletion.error,
      });

      return res.status(500).json({
        error: "Failed to complete request",
        completionId: llmCompletion.id,
      });
    } else {
      assert(llmCompletion.output !== null);
      assert(llmCompletion.completionTokens !== null);
      assert(llmCompletion.delayTimeMs !== null);
      assert(llmCompletion.executionTimeMs !== null);
      assert(llmCompletion.promptTokens !== null);

      return res.status(201).json({
        sessionId: session.id,
        completionId: llmCompletion.id,
        output: llmCompletion.output,
        usage: {
          completionTokens: llmCompletion.completionTokens,
          delayTime: llmCompletion.delayTimeMs,
          executionTime: llmCompletion.executionTimeMs,
          promptTokens: llmCompletion.promptTokens,
          totalTokens:
            llmCompletion.promptTokens + llmCompletion.completionTokens,
        },
      } satisfies v.InferInput<typeof ResponseSchema>);
    }
  });
