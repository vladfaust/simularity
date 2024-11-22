import * as api from "@/lib/api";
import { jwtStorage } from "@/lib/storage/user";
import pRetry from "p-retry";
import { ref } from "vue";
import type {
  BaseTtsDriver,
  TtsDriverConfig,
  TtsParams,
} from "./BaseTtsDriver";

export class RemoteTtsDriver implements BaseTtsDriver {
  readonly ready = ref(true);
  readonly busy = ref(false);

  get modelId() {
    return this.config.modelId;
  }

  constructor(readonly config: TtsDriverConfig) {}

  compareConfig(other: TtsDriverConfig): boolean {
    return other.type === "remote" && other.modelId === this.config.modelId;
  }

  // FIXME: When failed and chunks is not empty,
  // shall restart inference in UI.
  async createTts(
    speaker: {
      gptCondLatent: number[][];
      speakerEmbedding: number[];
    },
    text: string,
    locale: Intl.Locale,
    onChunk?: (chunk: ArrayBuffer) => void,
    params?: TtsParams,
    abortSignal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    if (!jwtStorage.value) {
      throw new api.UnauthorizedError();
    }

    abortSignal?.addEventListener("abort", () => {
      console.warn("Aborting inference is not supported yet");
    });

    try {
      this.busy.value = true;

      const chunks: Uint8Array[] = [];

      await pRetry(
        async () => {
          const { epilogue } = await api.rest.v1.ai.tts.createCompletion(
            {
              modelId: this.config.modelId,
              gptCondLatent: speaker.gptCondLatent,
              speakerEmbedding: speaker.speakerEmbedding,
              text,
              locale: locale.toString(),
              ...params,
            },
            {
              jwt: jwtStorage.value!,
              onInferenceChunk: (data) => {
                const chunk = Uint8Array.from(atob(data.chunkBase64), (c) =>
                  c.charCodeAt(0),
                );

                chunks.push(chunk);
                onChunk?.(chunk);
              },
            },
          );

          console.debug("Epilogue", epilogue);
        },
        {
          onFailedAttempt: (error) => {
            console.error("Failed attempt", error);
          },
          shouldRetry: (_) => {
            if (chunks.length) {
              console.warn(
                "FIXME: Would not retry because chunks is not empty",
              );

              return false;
            } else {
              return true;
            }
          },
        },
      );

      return new Blob(chunks, { type: "audio/mpeg" }).arrayBuffer();
    } finally {
      this.busy.value = false;
    }
  }

  async destroy() {}
}
