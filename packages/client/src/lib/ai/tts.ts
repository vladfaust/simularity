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

const TTS_STREAM_PAYLOAD = v.object({
  ...TTS_PAYLOAD.entries,
  stream_chunk_size: v.optional(v.number()),
  add_wav_header: v.optional(v.boolean()),
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

  /**
   * Generate speech from text and stream the audio data.
   * @yields WAV audio data.
   */
  async *ttsStream(
    body: v.InferOutput<typeof TTS_STREAM_PAYLOAD>,
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

    const response = await fetch(`${this.baseUrl}/tts_stream`, {
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

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to create reader");
    }

    let done = false;
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        console.debug(`Received ${value.byteLength} bytes`);
        yield value;
      }
    }
  }
}
