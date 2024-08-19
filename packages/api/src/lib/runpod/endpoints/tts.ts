import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { RunpodEndpoint } from "@/lib/runpod.js";
import { omit } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import { MultiCurrencyCostSchema } from "@simularity/api-sdk/common";
import assert from "assert";
import { toMilliseconds } from "duration-fns";
import runpodSdk from "runpod-sdk";
import { LocalRunpodEndpoint } from "../localEndpoint.js";

export const TtsParamsSchema = v.strictObject({
  text: v.string(),
  language: v.string(),
  overlap_wav_len: v.optional(v.number()),
  temperature: v.optional(v.number()),
  length_penalty: v.optional(v.number()),
  repetition_penalty: v.optional(v.number()),
  top_k: v.optional(v.number()),
  top_p: v.optional(v.number()),
  do_sample: v.optional(v.boolean()),
  speed: v.optional(v.number()),
  enable_text_splitting: v.optional(v.boolean()),
});

export const TtsEndpointInputSchema = v.object({
  ...TtsParamsSchema.entries,
  speaker_embedding: v.array(v.number()),
  gpt_cond_latent: v.array(v.array(v.number())),
});

const TtsEndpointOutputSchema = v.object({
  wav_base64: v.string(),
});

export class TtsEndpoint {
  static create(worker: typeof d.ttsWorkers.$inferSelect) {
    assert(worker.providerId === "runpod");

    if (worker.providerExternalId) {
      const runpod = runpodSdk(env.RUNPOD_API_KEY, {
        baseUrl: env.RUNPOD_BASE_URL,
      });

      const endpoint = runpod.endpoint(worker.providerExternalId);
      if (!endpoint) {
        return null;
      } else {
        return new TtsEndpoint(worker, endpoint);
      }
    } else if (env.NODE_ENV !== "development") {
      throw new Error(`Missing providerExternalId for worker ${worker.id}`);
    } else {
      konsole.log(`Using local Runpod endpoint at ${env.RUNPOD_BASE_URL}`);
      const endpoint = new LocalRunpodEndpoint(env.RUNPOD_BASE_URL);
      return new TtsEndpoint(worker, endpoint);
    }
  }

  async run(input: v.InferOutput<typeof TtsEndpointInputSchema>): Promise<{
    inference: typeof d.ttsInferences.$inferSelect;
    wavBase64: string | null;
  }> {
    const inferenceParams: v.InferOutput<typeof TtsParamsSchema> = omit(input, [
      "speaker_embedding",
      "gpt_cond_latent",
    ]);

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

      konsole.debug("Runpod result", omit(runResult, ["output"]));

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
          TtsEndpointOutputSchema,
          runResult.output,
        );

        if (!parsedOutput.success) {
          // Invalid Runpod result output.
          konsole.error("Invalid Runpod result output", {
            issues: v.flatten(parsedOutput.issues),
          });

          return {
            inference: (
              await d.db
                .insert(d.ttsInferences)
                .values({
                  workerId: this.worker.id,
                  params: inferenceParams,
                  providerExternalId: runResult.id,
                  delayTimeMs: runResult.delayTime,
                  executionTimeMs: runResult.executionTime,
                  error: `Invalid Runpod result output: ${JSON.stringify(v.flatten(parsedOutput.issues))}`,
                  estimatedCost,
                })
                .returning()
            )[0],
            wavBase64: null,
          };
        }

        // Success.
        return {
          inference: (
            await d.db
              .insert(d.ttsInferences)
              .values({
                workerId: this.worker.id,
                params: inferenceParams,
                providerExternalId: runResult.id,
                delayTimeMs: runResult.delayTime,
                executionTimeMs: runResult.executionTime,
                estimatedCost,
              })
              .returning()
          )[0],
          wavBase64: parsedOutput.output.wav_base64,
        };
      } else {
        // TODO: Handle "IN_QUEUE", possibly by polling.
        //

        konsole.error("Invalid Runpod result status", {
          status: runResult.status,
        });

        return {
          inference: (
            await d.db
              .insert(d.ttsInferences)
              .values({
                workerId: this.worker.id,
                params: inferenceParams,
                providerExternalId: runResult.id,
                delayTimeMs: runResult.delayTime,
                executionTimeMs: runResult.executionTime,
                error: `Invalid Runpod result status: ${runResult.status}`,
              })
              .returning()
          )[0],
          wavBase64: null,
        };
      }
    } catch (e: any) {
      console.error(e);

      // Unexpected error (e.g. network error).
      return {
        inference: (
          await d.db
            .insert(d.ttsInferences)
            .values({
              workerId: this.worker.id,
              params: inferenceParams,
              error: e.message,
            })
            .returning()
        )[0],
        wavBase64: null,
      };
    }
  }

  private constructor(
    readonly worker: typeof d.ttsWorkers.$inferSelect,
    private readonly endpoint: RunpodEndpoint | LocalRunpodEndpoint,
  ) {}
}
