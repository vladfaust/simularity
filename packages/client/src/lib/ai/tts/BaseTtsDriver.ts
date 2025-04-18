import { v } from "@/lib/valibot";
import type { Ref } from "vue";

export type TtsDriverConfig = {
  type: "remote";
  baseUrl: string;
  modelId: string;
};

export const TtsParamsSchema = v.object({
  topP: v.optional(v.number()),
  topK: v.optional(v.number()),
  temperature: v.optional(v.number()),
  lengthPenalty: v.optional(v.number()),
  repetitionPenalty: v.optional(v.number()),
  speed: v.optional(v.number()),
  streamChunkSize: v.optional(v.number()),
  enableTextSplitting: v.optional(v.boolean()),
});

export type TtsParams = v.InferOutput<typeof TtsParamsSchema>;

export interface BaseTtsDriver {
  modelId: string;

  /**
   * Whether is the driver ready to accept new requests.
   */
  ready: Ref<boolean>;

  /**
   * Whether the driver is currently busy.
   * Note: it can be busy even when ready.
   */
  busy: Ref<boolean>;

  /**
   * Return whether the configuration of this driver is the same as the other.
   */
  compareConfig(other: any): boolean;

  /**
   * Create a TTS completion.
   * @returns WAV audio data.
   */
  createTts(
    speaker: {
      gptCondLatent: number[][];
      speakerEmbedding: number[];
    },
    text: string,
    locale: Intl.Locale,
    onChunk?: (chunk: ArrayBuffer) => void,
    params?: TtsParams,
    abortSignal?: AbortSignal,
  ): Promise<ArrayBuffer>;

  destroy(): Promise<void>;
}
