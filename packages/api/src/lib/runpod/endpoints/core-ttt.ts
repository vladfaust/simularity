import { env } from "@/env";
import { d } from "@/lib/drizzle";
import { konsole } from "@/lib/konsole";
import { RunpodEndpoint } from "@/lib/runpod";
import {
  MultiCurrencyCostSchema,
  Text2TextCompletionOptions,
} from "@/lib/schema";
import { safeParseJson, sleep } from "@/lib/utils";
import { v } from "@/lib/valibot";
import assert from "assert";
import { eq } from "drizzle-orm";
import { toMilliseconds } from "duration-fns";
import runpodSdk from "runpod-sdk";
import { LocalRunpodEndpoint } from "../localEndpoint";
import { IrrecoverableError, wrapRunpodRequest } from "./_common";

const EndpointInputOptionsSchema = v.object({
  n_prev: v.optional(v.number()),
  n_probs: v.optional(v.number()),
  min_keep: v.optional(v.number()),
  top_k: v.optional(v.number()),
  top_p: v.optional(v.number()),
  min_p: v.optional(v.number()),
  tfs_z: v.optional(v.number()),
  typical_p: v.optional(v.number()),
  temp: v.optional(v.number()),
  dynatemp: v.optional(
    v.object({
      range: v.optional(v.number()),
      exponent: v.optional(v.number()),
    }),
  ),
  penalty: v.optional(
    v.object({
      last_n: v.optional(v.number()),
      repeat: v.optional(v.number()),
      freq: v.optional(v.number()),
      present: v.optional(v.number()),
      penalize_nl: v.optional(v.boolean()),
    }),
  ),
  mirostat: v.optional(
    v.object({
      version: v.picklist(["v1", "v2"]),
      tau: v.optional(v.number()),
      eta: v.optional(v.number()),
    }),
  ),
  seed: v.optional(v.number()),
  grammar: v.optional(v.string()),
  stop_sequences: v.optional(v.array(v.string())),
  lua_grammar: v.optional(v.string()),
});

const EndpointInputSchema = v.object({
  session_id: v.optional(v.number()),
  prompt: v.string(),
  n_eval: v.number(),
  options: v.optional(EndpointInputOptionsSchema),
});

type EndpointInput = v.InferOutput<typeof EndpointInputSchema>;

const IncompleteEndpointOutputSchema = v.object({
  done: v.literal(false),
  tokens: v.string(),
});

const CompleteEndpointOutputSchema = v.object({
  done: v.literal(true),
  session_id: v.number(),
  input_length: v.number(),
  context_length: v.number(),
});

const EndpointOutputSchema = v.variant("done", [
  IncompleteEndpointOutputSchema,
  CompleteEndpointOutputSchema,
]);

export class CoreTttEndpoint {
  static create(
    worker: typeof d.llmWorkers.$inferSelect,
  ): CoreTttEndpoint | null {
    assert(worker.providerId === "runpod-core");

    if ("endpointId" in worker.providerMeta) {
      const runpod = runpodSdk(env.RUNPOD_API_KEY, {
        baseUrl: env.RUNPOD_BASE_URL,
      });

      const endpoint = runpod.endpoint(worker.providerMeta.endpointId);
      if (!endpoint) {
        return null;
      } else {
        return new CoreTttEndpoint(worker, endpoint);
      }
    } else if (env.NODE_ENV !== "development") {
      throw new Error(`Missing endpointId for worker ${worker.id}`);
    } else {
      konsole.log(
        `Using local Runpod endpoint at ${worker.providerMeta.baseUrl}`,
      );
      const endpoint = new LocalRunpodEndpoint(worker.providerMeta.baseUrl);
      return new CoreTttEndpoint(worker, endpoint);
    }
  }

  /**
   * Run the vLLM endpoint asynchronously, streaming the output.
   */
  // TODO: Implement `onDecoding`.
  // TODO: Implement `abortSignal`.
  async run(
    session: Pick<
      typeof d.llmSessions.$inferSelect,
      "id" | "providerSessionId"
    >,
    prompt: string,
    nEval: number,
    options?: Text2TextCompletionOptions,
    onDecoding?: (progress: number) => void,
    onInference?: (tokens: string[]) => void,
    abortSignal?: AbortSignal,
  ): Promise<typeof d.llmCompletions.$inferSelect> {
    let coreSessionId = session.providerSessionId
      ? parseInt(session.providerSessionId)
      : undefined;

    const input = CoreTttEndpoint._toEndpointInput(
      coreSessionId,
      prompt,
      nEval,
      options,
    );

    const timeout = toMilliseconds({ minutes: 1 });

    try {
      const incompleteOutput = await wrapRunpodRequest(() => {
        konsole.debug("Endpoint run request");

        return this.endpoint.run(
          {
            input: {
              ...input,
              stream: true,
            },
            policy: {
              executionTimeout: toMilliseconds({
                // May need some time to warm up.
                minutes: 5,
              }),
            },
          },
          timeout,
        );
      });

      konsole.debug(incompleteOutput);

      const requestId = incompleteOutput.id;
      let status = incompleteOutput.status;

      loop: while (status === "IN_QUEUE") {
        const status = (
          await wrapRunpodRequest(() => {
            return this.endpoint.status(requestId, timeout);
          })
        ).status;

        switch (status) {
          case "IN_QUEUE":
            await sleep(100);
            continue;
          case "COMPLETED":
          case "IN_PROGRESS":
            break loop;
          default:
            throw new IrrecoverableError(`Unhandled Runpod status: ${status}`);
        }
      }

      let providerSessionId: number;
      let outputText: string = "";
      let usage: { input: number; output: number };

      await wrapRunpodRequest(async () => {
        konsole.debug("Endpoint stream request");

        outputText = "";
        for await (const rawOutput of this.endpoint.stream(
          requestId,
          timeout,
        )) {
          konsole.debug({ rawOutput });

          if (
            typeof rawOutput.output === "object" &&
            "error" in rawOutput.output
          ) {
            throw new IrrecoverableError(
              `Endpoint output error: ${rawOutput.output.error}`,
            );
          }

          // Output may include multiple JSON objects, separated by newlines.
          const lines = (rawOutput.output as string)
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

          if (lines.length === 0) {
            throw new IrrecoverableError("Empty output");
          }

          for (const line of lines) {
            const json = safeParseJson(line);
            if (!json) {
              throw new IrrecoverableError("Failed to parse JSON line");
            }

            const output = v.safeParse(EndpointOutputSchema, json);
            if (!output.success) {
              throw new IrrecoverableError(
                `Failed to parse object: ${JSON.stringify(v.flatten(output.issues))}`,
              );
            }

            if (output.output.done) {
              usage = {
                input: output.output.input_length,
                output:
                  output.output.context_length - output.output.input_length,
              };

              providerSessionId = output.output.session_id;
            } else {
              const tokens = output.output.tokens;
              onInference?.([tokens]);

              outputText += tokens;
            }
          }
        }
      });

      const finalStatus = await wrapRunpodRequest(() => {
        konsole.debug("Endpoint final status request");
        return this.endpoint.status(requestId, timeout);
      });

      konsole.debug({ finalStatus });
      const executionTime = (finalStatus as any).executionTime ?? 0;

      let estimatedCost:
        | v.InferOutput<typeof MultiCurrencyCostSchema>
        | undefined;

      switch (this.worker.providerPricing?.type) {
        case "perSecond": {
          estimatedCost = {
            [this.worker.providerPricing.currency]:
              (executionTime * this.worker.providerPricing.price) / 1000,
          };
        }
      }

      return await d.db.transaction(async (tx) => {
        await tx
          .update(d.llmSessions)
          .set({ providerSessionId: providerSessionId.toString() })
          .where(eq(d.llmSessions.id, session.id));

        return (
          await tx
            .insert(d.llmCompletions)
            .values({
              sessionId: session.id,
              workerId: this.worker.id,
              input,
              delayTimeMs: finalStatus.delayTime,
              executionTimeMs: executionTime,
              output: {
                requestId,
                text: outputText,
              },
              promptTokens: usage.input,
              completionTokens: usage.output,
              estimatedCost,
            })
            .returning()
        )[0];
      });
    } catch (e: any) {
      konsole.error(e);

      // Unexpected error (e.g. network error).
      return (
        await d.db
          .insert(d.llmCompletions)
          .values({
            sessionId: session.id,
            workerId: this.worker.id,
            input,
            error: e.message,
          })
          .returning()
      )[0];
    }
  }

  private static _toEndpointInput(
    sessionId: number | undefined,
    prompt: string,
    nEval: number,
    options?: Text2TextCompletionOptions,
  ): EndpointInput {
    return {
      session_id: sessionId,
      prompt,
      n_eval: nEval,
      options: options
        ? {
            n_prev: options.nPrev,
            n_probs: options.nProbs,
            min_keep: options.minKeep,
            top_k: options.topK,
            top_p: options.topP,
            min_p: options.minP,
            tfs_z: options.tfsZ,
            typical_p: options.typicalP,
            temp: options.temp,
            dynatemp: options.dynatemp,
            penalty: options.penalty,
            mirostat: options.mirostat,
            seed: options.seed,
            grammar:
              options.grammar?.lang === "gbnf"
                ? options.grammar.content
                : undefined,
            stop_sequences: options.stopSequences,
            lua_grammar:
              options.grammar?.lang === "lua-gbnf"
                ? options.grammar.content
                : undefined,
          }
        : undefined,
    };
  }

  private constructor(
    readonly worker: typeof d.llmWorkers.$inferSelect,
    private readonly endpoint: RunpodEndpoint | LocalRunpodEndpoint,
  ) {}
}
