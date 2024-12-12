import { d } from "@/lib/drizzle";
import { konsole } from "@/lib/konsole";
import { CoreTttEndpoint } from "@/lib/runpod/endpoints/core-ttt";
import { VllmEndpoint } from "@/lib/runpod/endpoints/vllm";
import { Text2TextCompletionOptionsSchema } from "@/lib/schema";
import { unreachable } from "@/lib/utils";
import { v } from "@/lib/valibot";
import { validateJwt } from "@/server/_common";
import { t } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { wrap } from "@typeschema/valibot";
import { and, eq, gte, sql } from "drizzle-orm";
import { WsContext } from "../../context";

type Prologue = {
  kind: "prologue";
  sessionId: string;
};

type Decoding = {
  kind: "decoding";
  progress?: number;
};

type Inference = {
  kind: "inference";
  tokens: string[];
};

type Epilogue = {
  kind: "epilogue";
  completionId: string;
  inputTokens: number;
  outputTokens: number;
};

type Completion = Prologue | Decoding | Inference | Epilogue;

export default t.procedure
  .input(
    wrap(
      v.object({
        jwt: v.string(),
        sessionId: v.optional(v.string()),
        modelId: v.string(),
        prompt: v.string(),
        nEval: v.number(),
        options: v.optional(Text2TextCompletionOptionsSchema),
      }),
    ),
  )
  .subscription(async ({ input, ctx }) => {
    //#region Preparation
    //

    const jwtPayload = await validateJwt(input.jwt);

    if (!jwtPayload) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
      });
    }

    const userId = jwtPayload.userId;

    const user = await d.db.query.users.findFirst({
      where: eq(d.users.id, userId),
    });

    if (!user) {
      throw new Error(`Authenticated user not found: ${userId}`);
    }

    const model = await d.db.query.llmModels.findFirst({
      where: eq(d.llmModels.id, input.modelId),
      columns: {
        id: true,
        requiredSubscriptionTier: true,
      },
    });

    if (!model) {
      konsole.warn("Model not found", input.modelId);

      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Model not found",
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

        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Subscription required: ${model.requiredSubscriptionTier}`,
        });
      }
    }

    const workerConditions = [
      eq(d.llmWorkers.enabled, true),
      eq(d.llmWorkers.modelId, input.modelId),
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
        modelId: input.modelId,
        grammarLang,
      });

      throw new TRPCError({
        code: "TIMEOUT",
        message: "No available worker found",
      });
    }

    const endpointClass =
      worker.providerId === "runpod-core" ? CoreTttEndpoint : VllmEndpoint;

    const endpoint = endpointClass.create(worker);
    if (!endpoint) {
      konsole.error("Runpod endpoint unavailable", {
        meta: worker.providerMeta,
      });

      throw new TRPCError({
        code: "TIMEOUT",
        message: "No available worker found",
      });
    }

    let sessionId = input.sessionId;
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
      } else if (session.modelId !== input.modelId) {
        konsole.log("Session model mismatch", {
          sessionId,
          modelId: input.modelId,
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
            modelId: input.modelId,
          })
          .returning({
            id: d.llmSessions.id,
            providerSessionId: d.llmSessions.providerSessionId,
          })
      )[0];
    }

    konsole.debug("Session", session);

    //
    //#endregion

    const abortController = new AbortController();

    (ctx as WsContext).req.socket.on("close", () => {
      konsole.debug("WebSocket close event", { sessionId });
      abortController.abort();
    });

    return observable<Completion>((observer) => {
      (async () => {
        try {
          observer.next({
            kind: "prologue",
            sessionId: session.id,
          });

          let isInferencing = false;

          const completion = await endpoint.run(
            session,
            input.prompt,
            input.nEval,
            input.options,
            (progress) => {
              if (isInferencing) {
                konsole.warn("Progress after inference began", progress);
                return;
              }

              observer.next({
                kind: "decoding",
                progress,
              });
            },
            (tokens) => {
              if (!isInferencing) {
                observer.next({
                  kind: "decoding",
                  progress: 1,
                });

                isInferencing = true;
              }

              observer.next({
                kind: "inference",
                tokens,
              });
            },
            abortController.signal,
          );

          if (completion.error) {
            observer.error(completion.error);
          } else {
            observer.next({
              kind: "epilogue",
              completionId: completion.id,
              inputTokens: completion.promptTokens!,
              outputTokens: completion.completionTokens!,
            });

            observer.complete();
          }
        } catch (e: any) {}
      })();
    });
  });
