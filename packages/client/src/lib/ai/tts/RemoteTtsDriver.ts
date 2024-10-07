import * as api from "@/lib/api";
import { Deferred, unreachable } from "@/lib/utils";
import type { Text2SpeechCompletionEpilogue } from "@simularity/api/lib/schema";
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
    try {
      this.busy.value = true;

      let deferred = new Deferred<void>();
      let chunks: Uint8Array[] = [];
      let epilogue: Text2SpeechCompletionEpilogue | undefined;

      const subscription =
        api.trpc.subscriptionsClient.text2Speech.createCompletion.subscribe(
          {
            modelId: this.config.modelId,
            gptCondLatent: speaker.gptCondLatent,
            speakerEmbedding: speaker.speakerEmbedding,
            text,
            locale: locale.toString(),
            ...params,
          },
          {
            onData: (data) => {
              switch (data.type) {
                case "inferenceChunk":
                  const chunk = Uint8Array.from(atob(data.chunkBase64), (c) =>
                    c.charCodeAt(0),
                  );

                  chunks.push(chunk);
                  onChunk?.(chunk);

                  break;

                case "epilogue":
                  epilogue = data;
                  break;

                default:
                  throw unreachable(data);
              }
            },

            onError: (e) => {
              console.error("Subscription error", e);
              deferred.reject(e);
            },

            onComplete: () => {
              console.debug("Subscription completed");
              deferred.resolve();
            },

            onStarted: () => {
              console.debug("Subscription started");
            },

            onStopped: () => {
              console.debug("Subscription stopped");
              deferred.resolve();
            },
          },
        );

      abortSignal?.addEventListener("abort", () => {
        console.debug("Aborting inference");
        subscription.unsubscribe();
      });

      await deferred.promise;

      if (!epilogue) {
        throw new Error("Epilogue not received");
      }

      console.debug("Epilogue", epilogue);

      return new Blob(chunks, { type: "audio/mpeg" }).arrayBuffer();
    } finally {
      this.busy.value = false;
    }
  }

  async destroy() {}
}
