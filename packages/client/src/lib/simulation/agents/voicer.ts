import type { BaseTtsDriver } from "@/lib/ai/tts/BaseTtsDriver";
import { computed, shallowRef, type ShallowRef } from "vue";
import type { Scenario } from "../scenario";
import { VoicerJob } from "./voicer/job";

export class Voicer {
  readonly ttsDriver: ShallowRef<BaseTtsDriver | null>;
  readonly ready = computed(() => this.ttsDriver.value?.ready.value);

  constructor(
    ttsDriver: BaseTtsDriver | null,
    private scenario: Scenario,
  ) {
    this.ttsDriver = shallowRef(ttsDriver);
  }

  /**
   * Create a new Text-To-Speech job.
   */
  createTtsJob(characterId: string | null, text: string) {
    return new VoicerJob(characterId, text, this, this.scenario);
  }
}
