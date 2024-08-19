import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { RunpodEndpoint } from "@/lib/runpod.js";
import { v } from "@/lib/valibot.js";
import { MultiCurrencyCostSchema } from "@simularity/api-sdk/common";
import { LlmCompletionParamsSchema } from "@simularity/api-sdk/v1/completions/create";
import assert from "assert";
import { toMilliseconds } from "duration-fns";
import runpodSdk from "runpod-sdk";

export const VllmEndpointInputSchema = v.object({
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
    }),
  ),
});

const VllmEndpointOutputSchema = v.array(
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
  static create(worker: typeof d.ttsWorkers.$inferSelect) {
    assert(worker.providerId === "runpod");

    const runpod = runpodSdk(env.RUNPOD_API_KEY, {
      baseUrl: env.RUNPOD_BASE_URL,
    });

    const endpoint = runpod.endpoint(worker.providerExternalId);
    if (!endpoint) {
      return null;
    } else {
      return new VllmEndpoint(worker, endpoint);
    }
  }

  async run(
    sessionId: string,
    input: v.InferOutput<typeof VllmEndpointInputSchema>,
  ): Promise<typeof d.llmCompletions.$inferSelect> {
    const completionParams: v.InferOutput<typeof LlmCompletionParamsSchema> = {
      ...input.sampling_params,
      guided_grammar: input.guided_options_request?.guided_grammar,
      guided_regex: input.guided_options_request?.guided_regex,
    };

    try {
      const runResult = await this.endpoint.runSync(
        {
          input,
          policy: {
            executionTimeout: toMilliseconds({
              // May need some time to warm up.
              minutes: 5,
            }),
          },
        },
        toMilliseconds({ minutes: 10 }),
      );

      konsole.debug(
        "Runpod result",
        runResult,
        JSON.stringify(runResult.output),
      );

      if (runResult.status === "COMPLETED") {
        let estimatedCost:
          | v.InferOutput<typeof MultiCurrencyCostSchema>
          | undefined;

        switch (this.worker.providerPricing?.type) {
          case "perSecond": {
            estimatedCost = {
              [this.worker.providerPricing.currency]:
                (runResult.executionTime * this.worker.providerPricing.price) /
                1000,
            };
          }
        }

        const parsedOutput = v.safeParse(
          VllmEndpointOutputSchema,
          runResult.output,
        );

        if (!parsedOutput.success) {
          // Invalid Runpod result output.
          konsole.error("Invalid Runpod result output", {
            issues: v.flatten(parsedOutput.issues),
          });

          return (
            await d.db
              .insert(d.llmCompletions)
              .values({
                sessionId,
                workerId: this.worker.id,
                params: completionParams,
                input: input.prompt,
                providerExternalId: runResult.id,
                delayTimeMs: runResult.delayTime,
                executionTimeMs: runResult.executionTime,
                error: `Invalid Runpod result output: ${JSON.stringify(v.flatten(parsedOutput.issues))}`,
                estimatedCost,
              })
              .returning()
          )[0];
        }

        // Success.
        return (
          await d.db
            .insert(d.llmCompletions)
            .values({
              sessionId,
              workerId: this.worker.id,
              params: completionParams,
              input: input.prompt,
              providerExternalId: runResult.id,
              delayTimeMs: runResult.delayTime,
              executionTimeMs: runResult.executionTime,
              output: parsedOutput.output[0].choices[0].tokens[0],
              promptTokens: parsedOutput.output[0].usage.input,
              completionTokens: parsedOutput.output[0].usage.output,
              estimatedCost,
            })
            .returning()
        )[0];
      } else {
        // TODO: Handle "IN_QUEUE", possibly by polling.
        //

        konsole.error("Invalid Runpod result status", {
          status: runResult.status,
        });

        return (
          await d.db
            .insert(d.llmCompletions)
            .values({
              sessionId,
              workerId: this.worker.id,
              params: completionParams,
              input: input.prompt,
              providerExternalId: runResult.id,
              delayTimeMs: runResult.delayTime,
              executionTimeMs: runResult.executionTime,
              error: `Invalid Runpod result status: ${runResult.status}`,
            })
            .returning()
        )[0];
      }
    } catch (e: any) {
      console.error(e);

      // Unexpected error (e.g. network error).
      return (
        await d.db
          .insert(d.llmCompletions)
          .values({
            sessionId,
            workerId: this.worker.id,
            params: completionParams,
            input: input.prompt,
            error: e.message,
          })
          .returning()
      )[0];
    }
  }

  private constructor(
    readonly worker: typeof d.llmWorkers.$inferSelect,
    private readonly endpoint: RunpodEndpoint,
  ) {}
}
