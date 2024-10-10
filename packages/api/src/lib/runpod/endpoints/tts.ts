import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { RunpodEndpoint } from "@/lib/runpod.js";
import { MultiCurrencyCostSchema, TtsParamsSchema } from "@/lib/schema.js";
import { omit, sleep } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import assert from "assert";
import { toMilliseconds } from "duration-fns";
import pRetry from "p-retry";
import runpodSdk from "runpod-sdk";
import { LocalRunpodEndpoint } from "../localEndpoint.js";

export const TtsEndpointInputSchema = v.object({
  ...TtsParamsSchema.entries,
  speaker_embedding: v.array(v.number()),
  gpt_cond_latent: v.array(v.array(v.number())),
});

const TtsStreamingPrologueSchema = v.object({
  inference_id: v.string(),
});

const TtsStreamingChunkSchema = v.object({
  wav_base_64: v.string(),
});

const TtsStreamingEpilogueSchema = v.object({
  usage: v.object({
    execution_time: v.number(),
  }),
});

export class TtsEndpoint {
  static create(
    userId: string,
    worker: typeof d.ttsWorkers.$inferSelect,
  ): TtsEndpoint | null {
    assert(worker.providerId === "runpod");

    if (worker.providerExternalId) {
      const runpod = runpodSdk(env.RUNPOD_API_KEY, {
        baseUrl: env.RUNPOD_BASE_URL,
      });

      const endpoint = runpod.endpoint(worker.providerExternalId);
      if (!endpoint) {
        return null;
      } else {
        return new TtsEndpoint(userId, worker, endpoint);
      }
    } else if (env.NODE_ENV !== "development") {
      throw new Error(`Missing providerExternalId for worker ${worker.id}`);
    } else {
      konsole.log(`Using local Runpod endpoint at ${env.RUNPOD_BASE_URL}`);
      const endpoint = new LocalRunpodEndpoint(env.RUNPOD_BASE_URL);
      return new TtsEndpoint(userId, worker, endpoint);
    }
  }

  /**
   * Run the TTS endpoint asynchronously, streaming the output in WAV format.
   *
   * @param targetFormat The format to place in the database.
   */
  async run(
    input: v.InferOutput<typeof TtsEndpointInputSchema>,
    onInference: (wavBase64: string) => Promise<void>,
  ) {
    const inferenceParams: v.InferOutput<typeof TtsParamsSchema> = {
      ...omit(input, ["speaker_embedding", "gpt_cond_latent"]),
    };

    const timeout = toMilliseconds({ minutes: 1 });

    try {
      const incompleteOutput = await pRetry(
        () =>
          this.endpoint.run(
            {
              input: {
                ...input,
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
        { retries: 5, onFailedAttempt: (e) => konsole.warn(e) },
      );

      konsole.debug(incompleteOutput);
      const requestId = incompleteOutput.id;
      let status = incompleteOutput.status;

      loop: while (status === "IN_QUEUE") {
        status = (
          await pRetry(() => this.endpoint.status(requestId, timeout), {
            retries: 5,
            onFailedAttempt: (e) => konsole.warn(e),
          })
        ).status;

        switch (status) {
          case "IN_QUEUE":
            await sleep(100);
            continue;
          case "COMPLETED":
          case "IN_PROGRESS":
            break loop;
          // TODO: Handle CANCELLED status.
          default:
            throw new Error(`Unhandled Runpod status: ${status}`);
        }
      }

      let inferenceId: string | undefined;
      let usage: { execution_time: number } | undefined;

      for await (const rawOutput of await pRetry(
        () => this.endpoint.stream(requestId, timeout),
        { retries: 5, onFailedAttempt: (e) => konsole.warn(e) },
      )) {
        if ("inference_id" in rawOutput.output) {
          const prologue = v.safeParse(
            TtsStreamingPrologueSchema,
            rawOutput.output,
          );

          if (!prologue.success) {
            konsole.error("Invalid Runpod prologue", {
              issues: JSON.stringify(v.flatten(prologue.issues)),
            });

            throw new Error("Invalid Runpod prologue");
          }

          inferenceId = prologue.output.inference_id;
        } else if ("wav_base_64" in rawOutput.output) {
          const chunk = v.safeParse(TtsStreamingChunkSchema, rawOutput.output);

          if (!chunk.success) {
            konsole.error("Invalid Runpod chunk", {
              issues: JSON.stringify(v.flatten(chunk.issues)),
            });

            throw new Error("Invalid Runpod chunk");
          }

          await onInference(chunk.output.wav_base_64);
        } else if ("usage" in rawOutput.output) {
          const epilogue = v.safeParse(
            TtsStreamingEpilogueSchema,
            rawOutput.output,
          );

          if (!epilogue.success) {
            konsole.error("Invalid Runpod epilogue", {
              issues: JSON.stringify(v.flatten(epilogue.issues)),
            });

            throw new Error("Invalid Runpod epilogue");
          }

          usage = {
            execution_time: epilogue.output.usage.execution_time,
          };
        } else {
          konsole.error("Unknown Runpod output", rawOutput.output);
          throw new Error("Unknown Runpod output");
        }
      }

      const finalStatus =
        this.endpoint instanceof LocalRunpodEndpoint
          ? { delayTime: 0 }
          : await pRetry(() => this.endpoint.status(requestId, timeout), {
              retries: 5,
              onFailedAttempt: (e) => konsole.warn(e),
            });

      console.debug("TTS final status", finalStatus);

      const executionTime = usage!.execution_time;

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
          .insert(d.ttsInferences)
          .values({
            workerId: this.worker.id,
            params: inferenceParams,
            providerExternalId: requestId,
            delayTimeMs: finalStatus.delayTime,
            executionTimeMs: executionTime,
            estimatedCost,
          })
          .returning()
      )[0];
    } catch (e: any) {
      konsole.error(e);

      // Unexpected error (e.g. network error).
      return (
        await d.db
          .insert(d.ttsInferences)
          .values({
            workerId: this.worker.id,
            params: inferenceParams,
            error: e.message,
          })
          .returning()
      )[0];
    }
  }

  private constructor(
    readonly userId: string,
    readonly worker: typeof d.ttsWorkers.$inferSelect,
    private readonly endpoint: RunpodEndpoint | LocalRunpodEndpoint,
  ) {}
}
