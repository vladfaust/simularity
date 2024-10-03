import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import {
  VllmEndpoint,
  VllmEndpointInputSchema,
} from "@/lib/runpod/endpoints/vllm.js";
import {
  LlmCompletionParamsSchema,
  Text2TextCompletionEpilogue,
} from "@/lib/schema.js";
import { omit, pick } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import { protectedProcedure } from "@/server/trpc/middleware/auth.js";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { wrap } from "@typeschema/valibot";
import assert from "assert";
import { and, eq } from "drizzle-orm";

type Inference = {
  type: "inference";
  tokens: string[];
};

export default protectedProcedure
  .input(
    wrap(
      v.object({
        model: v.string(),
        prompt: v.string(),
        sessionId: v.optional(v.string()),
        ...LlmCompletionParamsSchema.entries,
      }),
    ),
  )
  .subscription(({ ctx, input }) => {
    return observable<Inference | Text2TextCompletionEpilogue>((observer) => {
      (async () => {
        const user = await d.db.query.users.findFirst({
          where: eq(d.users.id, ctx.userId),
          columns: {
            id: true,
            creditBalance: true,
          },
        });

        if (!user) {
          throw new Error(`User not found in database: ${ctx.userId}`);
        }

        if (parseFloat(user.creditBalance) <= 0) {
          konsole.log("Not enough credit balance", {
            userId: user.id,
            creditBalance: user.creditBalance,
          });

          return observer.error(
            new TRPCError({
              code: "FORBIDDEN",
              message: "Not enough credit balance",
            }),
          );
        }

        const worker = await d.db.query.llmWorkers.findFirst({
          where: and(
            eq(d.llmWorkers.providerId, "runpod"),
            eq(d.llmWorkers.enabled, true),
            eq(d.llmWorkers.modelId, input.model),
          ),
          with: {
            model: {
              columns: {
                creditPrice: true,
              },
            },
          },
        });

        if (!worker) {
          konsole.warn("No available worker found", {
            model: input.model,
            providerId: "runpod",
          });

          return observer.error(
            new TRPCError({
              code: "TIMEOUT",
              message: "No available worker found",
            }),
          );
        }

        const endpoint = VllmEndpoint.create(user.id, worker);
        if (!endpoint) {
          konsole.error("Runpod endpoint unavailable", {
            endpointId: worker.providerExternalId,
          });

          return observer.error(
            new TRPCError({
              code: "TIMEOUT",
              message: "No available worker found",
            }),
          );
        }

        let sessionId: string | undefined;
        // const sessionIdHeader = req.headers["x-session-id"];
        const sessionIdHeader = input.sessionId;
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
              observer.next({
                type: "inference",
                tokens,
              });
            },
          );

          if (llmCompletion.error) {
            observer.error(llmCompletion.error);
          } else {
            assert(llmCompletion.output !== null);
            assert(llmCompletion.completionTokens !== null);
            assert(llmCompletion.delayTimeMs !== null);
            assert(llmCompletion.executionTimeMs !== null);
            assert(llmCompletion.promptTokens !== null);

            observer.next({
              type: "epilogue",
              sessionId: session.id,
              completionId: llmCompletion.id,
              usage: {
                completionTokens: llmCompletion.completionTokens,
                delayTime: llmCompletion.delayTimeMs,
                executionTime: llmCompletion.executionTimeMs,
                promptTokens: llmCompletion.promptTokens,
                totalTokens:
                  llmCompletion.promptTokens + llmCompletion.completionTokens,
                creditCost: llmCompletion.creditCost,
              },
            });

            return observer.complete();
          }
        } catch (e: any) {
          konsole.error("Failed to complete request", e);

          return observer.error(
            new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to complete request",
            }),
          );
        }
      })();
    });
  });
