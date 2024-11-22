import { d } from "@/lib/drizzle";
import { konsole } from "@/lib/konsole";
import {
  TtsEndpoint,
  TtsEndpointInputSchema,
} from "@/lib/runpod/endpoints/tts";
import * as schema from "@/lib/schema/rest/v1/ai/tts/createCompletion";
import { omit, sleep } from "@/lib/utils";
import { v } from "@/lib/valibot";
import { getAuthenticatedUserId } from "@/server/_common";
import assert from "assert";
import bodyParser from "body-parser";
import { ChildProcess, spawn } from "child_process";
import cors from "cors";
import { and, eq, gte, sql } from "drizzle-orm";
import { Router } from "express";

// TODO: Make it configurable per model.
const SUPPORTED_LOCALES = ["en", "ru"];

export default Router()
  .use(cors())
  .use(
    bodyParser.json({
      limit: "1mb",
    }),
  )
  .post("/", async (req, res) => {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.sendStatus(401);

    const user = await d.db.query.users.findFirst({
      where: eq(d.users.id, userId),
    });

    if (!user) {
      throw new Error(`Authenticated user not found: ${userId}`);
    }

    const parseResult = v.safeParse(schema.RequestBodySchema, req.body);
    if (!parseResult.success) {
      const issues = v.flatten(parseResult.issues);
      konsole.debug("Invalid request body", issues);
      return res.status(400).json({ issues });
    }

    const input = parseResult.output;

    const model = await d.db.query.ttsModels.findFirst({
      where: eq(d.ttsModels.id, input.modelId),
      columns: {
        id: true,
        requiredSubscriptionTier: true,
      },
    });

    if (!model) {
      konsole.warn("Model not found", input.modelId);

      return res.status(400).json({
        error: "Model not found",
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
        konsole.warn("Subscription required", {
          userId: user.id,
          tier: model.requiredSubscriptionTier,
        });

        return res.status(402).json({
          error: `Subscription required: ${model.requiredSubscriptionTier}`,
        });
      }
    }

    const language = input.locale.split("-")[0];
    if (!SUPPORTED_LOCALES.includes(language)) {
      konsole.warn("Unsupported locale", input.locale);

      return res.status(400).json({
        error: "Unsupported locale",
      });
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

      return res.status(503).json({
        error: "No available worker found",
      });
    }

    const endpoint = TtsEndpoint.create(user.id, worker);
    if (!endpoint) {
      konsole.error("Runpod endpoint unavailable", {
        endpointId: worker.providerExternalId,
      });

      return res.status(503).json({
        error: "No available worker found",
      });
    }

    const ffmpeg = new FfmpegProcessor(
      ["-loglevel", "fatal", "-i", "pipe:0", "-f", "mp3", "pipe:1"],
      (processedData) => {
        res.write(
          JSON.stringify({
            done: false,
            chunkBase64: processedData.toString("base64"),
          } satisfies v.InferOutput<typeof schema.InferenceChunkSchema>) + "\n",
        );
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
      omit(endpointInput, ["gpt_cond_latent", "speaker_embedding", "text"]),
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
        // return observer.error(ttsCompletion.error);
        return res.status(500).json({
          error: ttsCompletion.error,
        });
      } else {
        assert(ttsCompletion.delayTimeMs !== null);
        assert(ttsCompletion.executionTimeMs !== null);

        await ffmpeg.waitForCompletion();

        res.write(
          JSON.stringify({
            done: true,
            inferenceId: ttsCompletion.id,
            usage: {
              delayTime: ttsCompletion.delayTimeMs,
              executionTime: ttsCompletion.executionTimeMs,
            },
          } satisfies v.InferOutput<typeof schema.EpilogueSchema>) + "\n",
        );

        return res.end();
      }
    } catch (e: any) {
      konsole.error("Failed to complete request", e);

      return res.status(500).json({
        error: "Failed to complete request",
      });
    } finally {
      ffmpeg.kill();
    }
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
