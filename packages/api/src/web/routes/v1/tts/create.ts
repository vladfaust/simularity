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
import { extractUser } from "../auth/_common.js";

/**
 * Create a new TTS inference.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json({ limit: "10mb" }))
  .post("/", async (req, res) => {
    const user = await extractUser(req);
    if (!user || user instanceof Error) return res.sendStatus(401);

    const body = v.safeParse(RequestBodySchema, req.body);
    if (!body.success) {
      konsole.log("Invalid request body", v.flatten(body.issues));
      return res.status(400).json({
        error: "Invalid request body",
        issues: v.flatten(body.issues),
      });
    }

    if (parseFloat(user.creditBalance) <= 0) {
      konsole.log("Not enough credit balance", {
        userId: user.id,
        creditBalance: user.creditBalance,
      });

      return res.status(402).json({
        error: "Not enough credit balance",
        creditBalance: user.creditBalance,
      });
    }

    const worker = await d.db.query.ttsWorkers.findFirst({
      where: and(
        eq(d.ttsWorkers.providerId, "runpod"),
        eq(d.ttsWorkers.enabled, true),
        eq(d.ttsWorkers.modelId, body.output.modelId),
      ),
      with: {
        model: {
          columns: {
            creditPrice: true,
          },
        },
      },
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

    const endpoint = TtsEndpoint.create(user.id, worker);
    if (!endpoint) {
      konsole.error("Runpod endpoint unavailable", {
        endpointId: worker.providerExternalId,
      });

      return res.status(503).json({
        error: "No available worker found",
      });
    }

    const result = await endpoint.run({
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

    if (result.inference.error) {
      konsole.error("Failed to complete request", {
        inferenceId: result.inference.id,
        error: result.inference.error,
      });

      return res.status(500).json({
        inferenceId: result.inference.id,
        error: "Failed to complete request",
      });
    } else {
      assert("wavBase64" in result);
      assert(result.inference.delayTimeMs !== null);
      assert(result.inference.executionTimeMs !== null);

      return res.status(201).json({
        inferenceId: result.inference.id,
        usage: {
          delayTime: result.inference.delayTimeMs,
          executionTime: result.inference.executionTimeMs,
          creditCost: result.inference.creditCost,
        },
        output: {
          wavBase64: result.wavBase64,
          wavDuration: result.wavDuration,
        },
      } satisfies v.InferInput<typeof ResponseBodySchema>);
    }
  });
