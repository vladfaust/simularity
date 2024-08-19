import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { TtsEndpoint } from "@/lib/runpod/endpoints/tts.js";
import { v } from "@/lib/valibot.js";
import {
  RequestBodySchema,
  ResponseBodySchema,
} from "@simularity/api-sdk/v1/tts/create";
import assert from "assert";
import bodyParser from "body-parser";
import cors from "cors";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { ensureUser } from "../auth/common.js";

/**
 * Create a new TTS inference.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json({ limit: "10mb" }))
  .post("/", async (req, res) => {
    const user = await ensureUser(req, res);
    if (!user) return res.sendStatus(401);

    const body = v.safeParse(RequestBodySchema, req.body);
    if (!body.success) {
      konsole.log("Invalid request body", v.flatten(body.issues));
      return res.status(400).json({
        error: "Invalid request body",
        issues: v.flatten(body.issues),
      });
    }

    const worker = await d.db.query.ttsWorkers.findFirst({
      where: and(
        eq(d.ttsWorkers.providerId, "runpod"),
        eq(d.ttsWorkers.enabled, true),
        eq(d.ttsWorkers.modelId, body.output.modelId),
      ),
    });

    if (!worker) {
      konsole.warn("No available worker found", {
        model: body.output.modelId,
        providerId: "runpod",
      });

      return res.status(503).json({
        error: "No available worker found",
      });
    }

    const endpoint = TtsEndpoint.create(worker);
    if (!endpoint) {
      konsole.error("Runpod endpoint unavailable", {
        endpointId: worker.providerExternalId,
      });

      return res.status(503).json({
        error: "No available worker found",
      });
    }

    const { inference, wavBase64 } = await endpoint.run({
      speaker_embedding: body.output.speakerEmbedding,
      gpt_cond_latent: body.output.gptCondLatent,
      text: body.output.text,
      language: body.output.language,
      overlap_wav_len: body.output.overlapWavLen,
      temperature: body.output.temperature,
      length_penalty: body.output.lengthPenalty,
      repetition_penalty: body.output.repetitionPenalty,
      top_k: body.output.topK,
      top_p: body.output.topP,
      do_sample: body.output.doSample,
      speed: body.output.speed,
      enable_text_splitting: body.output.enableTextSplitting,
    });

    if (inference.error) {
      konsole.error("Failed to complete request", {
        inferenceId: inference.id,
        error: inference.error,
      });

      return res.status(500).json({
        inferenceId: inference.id,
        error: "Failed to complete request",
      });
    } else {
      assert(wavBase64 !== null);
      assert(inference.delayTimeMs !== null);
      assert(inference.executionTimeMs !== null);

      return res.status(201).json({
        inferenceId: inference.id,
        usage: {
          delayTime: inference.delayTimeMs,
          executionTime: inference.executionTimeMs,
        },
        output: {
          wavBase64,
        },
      } satisfies v.InferInput<typeof ResponseBodySchema>);
    }
  });
