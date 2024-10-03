import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { RunpodEndpoint } from "@/lib/runpod.js";
import {
  LlmCompletionParamsSchema,
  MultiCurrencyCostSchema,
} from "@/lib/schema.js";
import { sleep } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import assert from "assert";
import { eq, sql } from "drizzle-orm";
import { toMilliseconds } from "duration-fns";
import pRetry from "p-retry";
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
      guided_json: v.optional(v.string()),
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
  static create(
    userId: string,
    worker: typeof d.llmWorkers.$inferSelect & {
      model: Pick<typeof d.llmModels.$inferSelect, "creditPrice">;
    },
  ): VllmEndpoint | null {
    assert(worker.providerId === "runpod");

    const runpod = runpodSdk(env.RUNPOD_API_KEY, {
      baseUrl: env.RUNPOD_BASE_URL,
    });

    const endpoint = runpod.endpoint(worker.providerExternalId);
    if (!endpoint) {
      return null;
    } else {
      return new VllmEndpoint(userId, worker, endpoint);
    }
  }

  /**
   * Run the vLLM endpoint asynchronously, streaming the output.
   */
  async run(
    sessionId: string,
    input: v.InferOutput<typeof VllmEndpointInputSchema>,
    onInference: (tokens: string[]) => void,
  ) {
    const completionParams: v.InferOutput<typeof LlmCompletionParamsSchema> = {
      ...input.sampling_params,
      guided_grammar: input.guided_options_request?.guided_grammar,
      guided_regex: input.guided_options_request?.guided_regex,
      guided_json: input.guided_options_request?.guided_json,
    };

    const timeout = toMilliseconds({ minutes: 1 });

    try {
      const incompleteOutput = await pRetry(
        () =>
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
        { retries: 3 },
      );

      konsole.debug(incompleteOutput);

      const requestId = incompleteOutput.id;
      let status = incompleteOutput.status;

      loop: while (status === "IN_QUEUE") {
        const status = (
          await pRetry(() => this.endpoint.status(requestId, timeout), {
            retries: 3,
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
            throw new Error(`Unhandled Runpod status: ${status}`);
        }
      }

      let usage:
        | {
            input: number;
            output: number;
          }
        | undefined;
      let outputText: string | undefined;

      for await (const rawOutput of await pRetry(
        () => this.endpoint.stream(requestId, timeout),
        { retries: 3 },
      )) {
        konsole.debug(JSON.stringify(rawOutput.output));

        const output = v.safeParse(
          VllmEndpointOutputSchema.item,
          rawOutput.output,
        );

        if (!output.success) {
          konsole.error("Invalid Runpod output", {
            issues: JSON.stringify(v.flatten(output.issues)),
          });

          throw new Error("Invalid Runpod output");
        }

        const tokens = output.output.choices[0].tokens;
        onInference(tokens);

        outputText ||= "";
        outputText += tokens.join("");

        usage = output.output.usage;
      }

      const finalStatus = await pRetry(
        () => this.endpoint.status(requestId, timeout),
        { retries: 3 },
      );

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

      const creditCost =
        usage && this.worker.model.creditPrice
          ? (
              (parseFloat(this.worker.model.creditPrice) *
                (usage.input + usage.output)) /
              1024
            ).toFixed(2)
          : undefined;

      if (creditCost) {
        konsole.log("Charging user for text2text", {
          userId: this.userId,
          creditCost,
        });

        await d.db
          .update(d.users)
          .set({
            creditBalance: sql`${d.users.creditBalance} - ${creditCost}`,
          })
          .where(eq(d.users.id, this.userId));
      }

      return (
        await d.db
          .insert(d.llmCompletions)
          .values({
            sessionId,
            workerId: this.worker.id,
            params: completionParams,
            input: input.prompt,
            providerExternalId: requestId,
            delayTimeMs: finalStatus.delayTime,
            executionTimeMs: executionTime,
            output: outputText,
            promptTokens: usage?.input,
            completionTokens: usage?.output,
            estimatedCost,
            creditCost: creditCost?.toString(),
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
    readonly userId: string,
    readonly worker: typeof d.llmWorkers.$inferSelect & {
      model: Pick<typeof d.llmModels.$inferSelect, "creditPrice">;
    },
    private readonly endpoint: RunpodEndpoint,
  ) {}
}
