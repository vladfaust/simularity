import { toMilliseconds } from "duration-fns";
import { timeoutSignal } from "../utils";
import { v } from "../valibot";

export class ServerError extends Error {}

export const TTS_SPEAKER = v.object({
  gpt_cond_latent: v.array(v.array(v.number())),
  speaker_embedding: v.array(v.number()),
});

const TTS_PAYLOAD = v.object({
  ...TTS_SPEAKER.entries,
  ...v.object({
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
  }).entries,
});

export class Tts {
  constructor(
    public baseUrl: string,
    public jwt?: string,
  ) {}

  /**
   * Generate speech from text.
   * @returns WAV audio data.
   */
  async tts(
    body: v.InferOutput<typeof TTS_PAYLOAD>,
    signal: AbortSignal | undefined = timeoutSignal(
      toMilliseconds({
        minutes: 5,
      }),
    ),
  ) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.jwt) {
      headers["Authorization"] = `Bearer ${this.jwt}`;
    }

    const response = await fetch(`${this.baseUrl}/tts`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      throw new ServerError(
        `Failed to create completion: ${response.status} ${await response.text()}`,
      );
    }

    return response.arrayBuffer();
  }

  async ttsStream() {}
}
