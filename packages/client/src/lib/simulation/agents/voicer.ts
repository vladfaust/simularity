import type { BaseTtsDriver } from "@/lib/ai/tts/BaseTtsDriver";
import { RemoteTtsDriver } from "@/lib/ai/tts/RemoteTtsDriver";
import * as storage from "@/lib/storage";
import { unreachable } from "@/lib/utils";
import { watchImmediate } from "@vueuse/core";
import { computed, shallowRef, type ShallowRef } from "vue";
import type { Scenario } from "../scenario";
import { VoicerJob } from "./voicer/job";

export class Voicer {
  readonly ttsDriver: ShallowRef<BaseTtsDriver | null>;
  readonly ready = computed(() => this.ttsDriver.value?.ready.value);
  private readonly _driverConfigWatchStopHandle: () => void;

  constructor(private scenario: Scenario) {
    this.ttsDriver = shallowRef(null);

    const agent = "voicer";

    this._driverConfigWatchStopHandle = watchImmediate(
      () => storage.tts.ttsConfig.value,
      async (ttsConfig) => {
        console.debug("Driver config watch trigger", agent, ttsConfig);
        const driverConfig = ttsConfig?.driver;

        if (ttsConfig?.enabled && driverConfig) {
          if (this.ttsDriver.value) {
            console.debug("Comparing driver configs.", agent, {
              other: driverConfig,
            });

            if (!this.ttsDriver.value.compareConfig(driverConfig)) {
              console.log(
                "Driver config is different, destroying the driver.",
                agent,
              );

              this.ttsDriver.value.destroy();
              this.ttsDriver.value = null;
            } else {
              console.debug("Driver config is the same.", agent);
              return;
            }
          }

          switch (driverConfig.type) {
            case "remote": {
              console.log("Creating new RemoteTtsDriver", {
                driverConfig,
              });

              this.ttsDriver.value = new RemoteTtsDriver(
                driverConfig,
                storage.remoteServerJwt,
              );

              break;
            }

            default:
              throw unreachable(driverConfig.type);
          }
        } else {
          // New driver config is empty, or TTS is disabled.
          // Destroy the driver instance if it exists.
          if (this.ttsDriver.value) {
            this.ttsDriver.value.destroy();
            this.ttsDriver.value = null;
          }
        }
      },
    );
  }

  /**
   * Create a new Text-To-Speech job.
   */
  createTtsJob(characterId: string | null, text: string) {
    return new VoicerJob(characterId, text, this, this.scenario);
  }

  destroy() {
    this._driverConfigWatchStopHandle();

    if (this.ttsDriver.value) {
      this.ttsDriver.value.destroy();
      this.ttsDriver.value = null;
    }
  }
}
