import type { TtsParams } from "@/lib/ai/tts/BaseTtsDriver";
import type { LocalScenario } from "@/lib/scenario";
import { enableTextSplitting } from "@/lib/storage/tts";
import { Deferred, sleep } from "@/lib/utils";
import { v } from "@/lib/valibot";
import { ref } from "vue";
import type { Voicer } from "../voicer";

const TTS_SPEAKER = v.object({
  gpt_cond_latent: v.array(v.array(v.number())),
  speaker_embedding: v.array(v.number()),
});

class MissingSpeakerError extends Error {
  constructor(characterId: string | null) {
    super(`Missing speaker for ${characterId ?? "narrator"}`);
  }
}

export enum VoicerJobStatus {
  FetchingSpeaker,
  Queued,
  Inferring,
  Error,
  Succees,
}

export class VoicerJob {
  readonly status = ref<VoicerJobStatus>(VoicerJobStatus.FetchingSpeaker);
  readonly progress = ref<number | undefined>();
  readonly result = new Deferred<ArrayBuffer | Error>();

  constructor(
    readonly characterId: string | null,
    readonly text: string,
    private agent: Voicer,
    private scenario: LocalScenario,
    private locale: Intl.Locale,
  ) {
    this.run();
  }

  private async run() {
    try {
      let embeddingsUrl: string;
      let params: TtsParams | undefined;

      if (this.characterId) {
        const character = this.scenario.ensureCharacter(this.characterId);
        if (!character.voices?.xttsV2) {
          throw new MissingSpeakerError(this.characterId);
        }

        params = character.voices.xttsV2.params;
        embeddingsUrl = await this.scenario.resourceUrl(
          character.voices.xttsV2.embedding.path,
        );
      } else {
        if (!this.scenario.content.narratorVoices?.xttsV2?.embedding.path) {
          throw new MissingSpeakerError(null);
        }

        params = this.scenario.content.narratorVoices.xttsV2.params;
        embeddingsUrl = await this.scenario.resourceUrl(
          this.scenario.content.narratorVoices.xttsV2.embedding.path,
        );
      }

      // Load embeddings as JSON.
      console.debug(`Fetching voice embeddings from ${embeddingsUrl}...`);
      const speaker = await fetch(embeddingsUrl)
        .then((res) => res.json())
        .then((json) => v.parse(TTS_SPEAKER, json));
      console.debug(`Fetched voice embeddings`);

      this.status.value = VoicerJobStatus.Queued;
      while (!this.agent.ttsDriver.value?.ready.value) {
        console.debug("Waiting for TTS driver to become ready...");
        await sleep(500);
      }

      const mediaSource = new MediaSource();

      // Wait until the audio stops playing.
      // TODO: Smoother transition (wait for the first chunk).
      await this.agent.playTtsFromMediaSource(mediaSource);

      const sourceBufferDef = new Deferred<SourceBuffer>();
      mediaSource.addEventListener("sourceopen", () => {
        sourceBufferDef.resolve(mediaSource.addSourceBuffer("audio/mp3"));
      });
      const sourceBuffer = await sourceBufferDef.promise;

      const chunks: Uint8Array[] = [];
      let wroteToBuffer = false;
      let doneInferring = false;

      (async () => {
        while (!doneInferring || chunks.length) {
          // See https://stackoverflow.com/questions/20042087/could-not-append-segments-by-media-source-api-get-invalidstateerror-an-attem.
          if (!sourceBuffer.updating && chunks.length) {
            sourceBuffer.appendBuffer(chunks.shift()!);
          }

          await sleep(10);
        }

        mediaSource.endOfStream();

        console.debug(
          `Finished streaming TTS for ${this.characterId ?? "narrator"}`,
        );
      })();

      this.status.value = VoicerJobStatus.Inferring;
      console.debug(`Creating TTS for ${this.characterId ?? "narrator"}...`);
      this.result.resolve(
        await this.agent.ttsDriver.value.createTts(
          {
            gptCondLatent: speaker.gpt_cond_latent,
            speakerEmbedding: speaker.speaker_embedding,
          },
          this.text,
          this.locale,
          (chunk) => {
            if (wroteToBuffer) {
              chunks.push(new Uint8Array(chunk));
            } else {
              wroteToBuffer = true;
              sourceBuffer.appendBuffer(chunk);
            }
          },
          {
            ...params,
            enableTextSplitting: enableTextSplitting.value,
          },
        ),
      );

      doneInferring = true;
      this.status.value = VoicerJobStatus.Succees;
    } catch (error: any) {
      this.status.value = VoicerJobStatus.Error;
      this.result.resolve(error);
    }
  }

  cancel() {
    console.warn(`Proper TTS job cancellation is not implemented yet`);
    this.result.reject(new Error("Cancelled"));
  }
}
