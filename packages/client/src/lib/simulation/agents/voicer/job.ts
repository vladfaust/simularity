import type { TtsParams } from "@/lib/ai/tts/BaseTtsDriver";
import { TTS_SPEAKER } from "@/lib/api/v1/tts/create";
import { Deferred, sleep } from "@/lib/utils";
import { v } from "@/lib/valibot";
import { ref } from "vue";
import type { Scenario } from "../../scenario";
import type { Voicer } from "../voicer";

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
    private scenario: Scenario,
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
          character.voices.xttsV2.embeddingPath,
        );
      } else {
        if (!this.scenario.narratorVoices?.xttsV2?.embeddingPath) {
          throw new MissingSpeakerError(null);
        }

        params = this.scenario.narratorVoices.xttsV2.params;
        embeddingsUrl = await this.scenario.resourceUrl(
          this.scenario.narratorVoices.xttsV2.embeddingPath,
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

      this.status.value = VoicerJobStatus.Inferring;
      console.debug(`Creating TTS for ${this.characterId ?? "narrator"}...`);
      this.result.resolve(
        await this.agent.ttsDriver.value.createTts(
          {
            gptCondLatent: speaker.gpt_cond_latent,
            speakerEmbedding: speaker.speaker_embedding,
          },
          this.text,
          this.scenario.language,
          params,
        ),
      );
      this.status.value = VoicerJobStatus.Succees;
    } catch (error: any) {
      this.status.value = VoicerJobStatus.Error;
      this.result.resolve(error);
    }
  }
}
