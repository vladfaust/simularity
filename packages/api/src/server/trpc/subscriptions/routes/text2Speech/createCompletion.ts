import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import {
  TtsEndpoint,
  TtsEndpointInputSchema,
} from "@/lib/runpod/endpoints/tts.js";
import { Text2SpeechCompletionEpilogue } from "@/lib/schema.js";
import { omit, sleep } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import { protectedProcedure } from "@/server/trpc/middleware/auth.js";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { wrap } from "@typeschema/valibot";
import assert from "assert";
import { ChildProcess, spawn } from "child_process";
import { and, eq, gte, sql } from "drizzle-orm";

type InferenceChunk = {
  type: "inferenceChunk";
  chunkBase64: string;
};

// TODO: Make it configurable per model.
const SUPPORTED_LOCALES = ["en", "ru"];

/**
 * Create a new TTS completion.
 */
export default protectedProcedure
  .input(
    wrap(
      v.strictObject({
        modelId: v.string(),
        speakerEmbedding: v.array(v.number()),
        gptCondLatent: v.array(v.array(v.number())),
        text: v.string(),
        locale: v.string(),
        streamChunkSize: v.optional(v.number()),
        overlapWavLen: v.optional(v.number()),
        temperature: v.optional(v.number()),
        lengthPenalty: v.optional(v.number()),
        repetitionPenalty: v.optional(v.number()),
        topK: v.optional(v.number()),
        topP: v.optional(v.number()),
        doSample: v.optional(v.boolean()),
        speed: v.optional(v.number()),
        enableTextSplitting: v.optional(v.boolean()),
      }),
    ),
  )
  .subscription(({ ctx, input }) => {
    return observable<InferenceChunk | Text2SpeechCompletionEpilogue>(
      (observer) => {
        (async () => {
          const user = await d.db.query.users.findFirst({
            where: eq(d.users.id, ctx.userId),
            columns: { id: true },
          });

          if (!user) {
            throw new Error(`User not found in database: ${ctx.userId}`);
          }

          const model = await d.db.query.ttsModels.findFirst({
            where: eq(d.ttsModels.id, input.modelId),
            columns: {
              id: true,
              requiredSubscriptionTier: true,
            },
          });

          if (!model) {
            konsole.warn("Model not found", input.modelId);

            return observer.error(
              new TRPCError({
                code: "BAD_REQUEST",
                message: `Model not found: ${input.modelId}`,
              }),
            );
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
              konsole.warn("Subscription required", {
                userId: user.id,
                tier: model.requiredSubscriptionTier,
              });

              return observer.error(
                new TRPCError({
                  code: "FORBIDDEN",
                  message: `Subscription required: ${
                    model.requiredSubscriptionTier
                  }`,
                }),
              );
            }
          }

          const language = input.locale.split("-")[0];
          if (!SUPPORTED_LOCALES.includes(language)) {
            konsole.warn("Unsupported locale", input.locale);

            return observer.error(
              new TRPCError({
                code: "BAD_REQUEST",
                message: "Unsupported locale",
              }),
            );
          }

          const worker = await d.db.query.ttsWorkers.findFirst({
            where: and(
              eq(d.ttsWorkers.providerId, "runpod"),
              eq(d.ttsWorkers.enabled, true),
              eq(d.ttsWorkers.modelId, input.modelId),
            ),
          });

          if (!worker) {
            konsole.warn("No available worker found", {
              model: input.modelId,
              providerId: "runpod",
            });

            return observer.error(
              new TRPCError({
                code: "TIMEOUT",
                message: "No available worker found",
              }),
            );
          }

          const endpoint = TtsEndpoint.create(user.id, worker);
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

          const ffmpeg = new FfmpegProcessor(
            ["-loglevel", "fatal", "-i", "pipe:0", "-f", "mp3", "pipe:1"],
            (processedData) => {
              observer.next({
                type: "inferenceChunk",
                chunkBase64: processedData.toString("base64"),
              });
            },
            (data) => {
              konsole.error("Ffmpeg stderr", data.toString());
            },
          );

          const endpointInput = {
            speaker_embedding: input.speakerEmbedding,
            gpt_cond_latent: input.gptCondLatent,
            text: input.text,
            language,
            stream_chunk_size: input.streamChunkSize,
            overlap_wav_len: input.overlapWavLen,
            temperature: input.temperature,
            length_penalty: input.lengthPenalty,
            repetition_penalty: input.repetitionPenalty,
            top_k: input.topK,
            top_p: input.topP,
            do_sample: input.doSample,
            speed: input.speed,
            enable_text_splitting: input.enableTextSplitting,
          } satisfies v.InferInput<typeof TtsEndpointInputSchema>;

          konsole.debug(
            "TTS endpoint input",
            omit(endpointInput, [
              "gpt_cond_latent",
              "speaker_embedding",
              "text",
            ]),
          );

          try {
            const ttsCompletion = await endpoint.run(
              endpointInput,
              async (wavBase64) => {
                const buffer = Buffer.from(wavBase64, "base64");
                konsole.debug("Received WAV", { length: buffer.length });
                await ffmpeg.write(buffer);
              },
            );

            if (ttsCompletion.error) {
              return observer.error(ttsCompletion.error);
            } else {
              assert(ttsCompletion.delayTimeMs !== null);
              assert(ttsCompletion.executionTimeMs !== null);

              await ffmpeg.waitForCompletion();

              observer.next({
                type: "epilogue",
                inferenceId: ttsCompletion.id,
                usage: {
                  delayTime: ttsCompletion.delayTimeMs,
                  executionTime: ttsCompletion.executionTimeMs,
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
          } finally {
            ffmpeg.kill();
          }
        })();
      },
    );
  });

/**
 * Wraps Ffmpeg CLI for processing audio data.
 * Maintains an internal stream which is written to by the TTS endpoint,
 * and read by Ffmpeg, and then piped to the client.
 */
class FfmpegProcessor {
  private _ffmpeg: ChildProcess;
  private _unprocessedChunks: Buffer[] = [];
  private _drained = true;

  get hasUnprocessedChunks() {
    return this._unprocessedChunks.length > 0;
  }

  constructor(
    args: string[],
    readonly onStdout: (data: any) => void,
    readonly onStderr: (data: any) => void,
  ) {
    this._ffmpeg = spawn("ffmpeg", args);

    this._ffmpeg.stdout!.on("data", (data) => {
      this.onStdout(data);
    });

    this._ffmpeg.stderr!.on("data", (data) => {
      this.onStderr(data);
    });

    this._ffmpeg.on("close", (code) => {
      konsole.debug("Ffmpeg process exited", { code });
    });

    this._writeLoop();
  }

  async write(buffer: Buffer) {
    this._unprocessedChunks.push(buffer);
  }

  async waitForCompletion() {
    while (this._unprocessedChunks.length > 0 || !this._drained) {
      await sleep(100);
    }

    this._ffmpeg.stdin!.end();

    while (this._ffmpeg.exitCode === null) {
      konsole.debug("Waiting for ffmpeg to exit...");
      await sleep(100);
    }
  }

  async kill() {
    if (!this._ffmpeg.killed) {
      this._ffmpeg.kill();
    }
  }

  private async _writeLoop() {
    // Once write() returns false, do not write more chunks
    // until the 'drain' event is emitted.
    this._ffmpeg.stdin!.on("drain", () => {
      konsole.debug("Ffmpeg stdin drained");
      this._drained = true;
    });

    while (!this._ffmpeg.killed) {
      if (!this._drained) {
        await sleep(100);
        continue;
      }

      const chunk = this._unprocessedChunks.shift();

      if (chunk) {
        this._drained = this._ffmpeg.stdin!.write(chunk, (err) => {
          if (err) {
            konsole.error("Failed to write to ffmpeg stdin", err);
          }
        });
      }

      await sleep(100);
    }
  }
}
