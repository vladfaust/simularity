import type { Ref } from "vue";

export type TtsDriverConfig = {
  type: "remote";
  baseUrl: string;
  modelId: string;
};

export interface BaseTtsDriver {
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
    language: string,
    abortSignal?: AbortSignal,
  ): Promise<ArrayBuffer>;

  destroy(): Promise<void>;
}
