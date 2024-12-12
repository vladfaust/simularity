import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { RunpodEndpoint } from "@/lib/runpod.js";
import {
  MultiCurrencyCostSchema,
  Text2TextCompletionOptions,
} from "@/lib/schema.js";
import { sleep } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import assert from "assert";
import { toMilliseconds } from "duration-fns";
import runpodSdk from "runpod-sdk";
import { wrapRunpodRequest } from "./_common";

const EndpointInputSchema = v.object({
  prompt: v.string(),
  sampling_params: v.object({
    max_tokens: v.optional(v.number()),
    presence_penalty: v.optional(v.number()),
    stop: v.optional(v.array(v.string())),
    temperature: v.optional(v.number()),
    top_p: v.optional(v.number()),
    top_k: v.optional(v.number()),
    min_p: v.optional(v.number()),
    repetition_penalty: v.optional(v.number()),
    stop_token_ids: v.optional(v.array(v.number())),
    include_stop_str_in_output: v.optional(v.boolean()),
    min_tokens: v.optional(v.number()),
  }),
  guided_options_request: v.optional(
    v.object({
      guided_grammar: v.optional(v.string()),
      guided_regex: v.optional(v.string()),
      guided_json: v.optional(v.string()),
    }),
  ),
});

type EndpointInput = v.InferOutput<typeof EndpointInputSchema>;

const EndpointOutputSchema = v.array(
  v.object({
    choices: v.array(
      v.object({
        tokens: v.array(v.string()),
      }),
    ),
    usage: v.object({
      input: v.number(),
      output: v.number(),
    }),
  }),
);

export class VllmEndpoint {
  static create(worker: typeof d.llmWorkers.$inferSelect): VllmEndpoint | null {
    assert(worker.providerId === "runpod-vllm");

    assert(
      "endpointId" in worker.providerMeta,
      "Local RunPod workers are not supported for vLLM",
    );

    const runpod = runpodSdk(env.RUNPOD_API_KEY, {
      baseUrl: env.RUNPOD_BASE_URL,
    });

    const endpoint = runpod.endpoint(worker.providerMeta.endpointId);
    if (!endpoint) {
      return null;
    } else {
      return new VllmEndpoint(worker, endpoint);
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
    const input = VllmEndpoint._toEndpointInput(prompt, nEval, options);
    const timeout = toMilliseconds({ minutes: 1 });

    try {
      const incompleteOutput = await wrapRunpodRequest(() =>
        this.endpoint.run(
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
        ),
      );

      konsole.debug(incompleteOutput);

      const requestId = incompleteOutput.id;
      let status = incompleteOutput.status;

      loop: while (status === "IN_QUEUE") {
        const status = (
          await wrapRunpodRequest(() =>
            this.endpoint.status(requestId, timeout),
          )
        ).status;

        switch (status) {
          case "IN_QUEUE":
            await sleep(100);
            continue;
          case "COMPLETED":
          case "IN_PROGRESS":
            break loop;
          default:
            throw new Error(`Unhandled Runpod status: ${status}`);
        }
      }

      let usage: { input: number; output: number } | undefined;
      let outputText = "";

      await wrapRunpodRequest(async () => {
        outputText = "";

        for await (const rawOutput of this.endpoint.stream(
          requestId,
          timeout,
        )) {
          konsole.debug(JSON.stringify(rawOutput.output));

          const output = v.safeParse(
            EndpointOutputSchema.item,
            rawOutput.output,
          );

          if (!output.success) {
            konsole.error("Invalid Runpod output", {
              issues: JSON.stringify(v.flatten(output.issues)),
            });

            throw new Error("Invalid Runpod output");
          }

          const tokens = output.output.choices[0].tokens;
          onInference?.(tokens);

          outputText += tokens.join("");
          usage = output.output.usage;
        }
      });

      assert(usage);

      const finalStatus = await wrapRunpodRequest(() =>
        this.endpoint.status(requestId, timeout),
      );
      konsole.debug({ finalStatus });

      const executionTime = (finalStatus as any).executionTime;

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

      return (
        await d.db
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
    prompt: string,
    nEval: number,
    options: Text2TextCompletionOptions | undefined,
  ): EndpointInput {
    return {
      prompt,
      sampling_params: {
        max_tokens: nEval,
        presence_penalty: options?.penalty?.present,
        stop: options?.stopSequences,
        temperature: options?.temp,
        top_p: options?.topP,
        top_k: options?.topK,
        min_p: options?.minP,
        repetition_penalty: options?.penalty?.repeat,
      },
      guided_options_request: options?.grammar
        ? {
            guided_grammar:
              options.grammar.lang === "lark"
                ? options.grammar.content
                : undefined,
            guided_json:
              options.grammar.lang === "json-schema"
                ? options.grammar.content
                : undefined,
            guided_regex:
              options.grammar.lang === "regex"
                ? options.grammar.content
                : undefined,
          }
        : undefined,
    };
  }

  private constructor(
    readonly worker: typeof d.llmWorkers.$inferSelect,
    private readonly endpoint: RunpodEndpoint,
  ) {}
}
