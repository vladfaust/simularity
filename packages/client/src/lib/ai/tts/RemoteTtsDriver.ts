import * as api from "@/lib/api";
import { ref, type Ref } from "vue";
import type {
  BaseTtsDriver,
  TtsDriverConfig,
  TtsParams,
} from "./BaseTtsDriver";

export class RemoteTtsDriver implements BaseTtsDriver {
  readonly ready = ref(true);
  readonly busy = ref(false);

  constructor(
    readonly config: TtsDriverConfig,
    readonly jwt: Ref<string | null>,
  ) {}

  compareConfig(other: TtsDriverConfig): boolean {
    return other.type === "remote" && other.modelId === this.config.modelId;
  }

  async createTts(
    speaker: {
      gptCondLatent: number[][];
      speakerEmbedding: number[];
    },
    text: string,
    language: string,
    params?: TtsParams,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    try {
      this.busy.value = true;
      return api.v1.tts.create(
        this.config.baseUrl,
        this.jwt.value ?? undefined,
        {
          modelId: this.config.modelId,
          gptCondLatent: speaker.gptCondLatent,
          speakerEmbedding: speaker.speakerEmbedding,
          text,
          language,
          ...params,
        },
        signal,
      );
    } finally {
      this.busy.value = false;
    }
  }

  async destroy() {}
}
