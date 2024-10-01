import type { BaseTtsDriver } from "@/lib/ai/tts/BaseTtsDriver";
import { RemoteTtsDriver } from "@/lib/ai/tts/RemoteTtsDriver";
import type { Scenario } from "@/lib/scenario";
import * as storage from "@/lib/storage";
import { sleep, unreachable } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { watchImmediate } from "@vueuse/core";
import { computed, ref, shallowRef, type ShallowRef } from "vue";
import { VoicerJob } from "./voicer/job";
export { VoicerJob };

export class Voicer {
  readonly ttsDriver: ShallowRef<BaseTtsDriver | null>;
  readonly ready = computed(() => this.ttsDriver.value?.ready.value);
  readonly enabled = computed(
    () => this.ttsDriver.value && storage.tts.ttsConfig.value?.enabled,
  );

  /**
   * The currently playing TTS audio file path.
   */
  readonly playingTts = computed<string | null>(() =>
    this._audioPlaying.value ? this._currentTtsFilePath.value : null,
  );

  private readonly _driverConfigWatchStopHandle: () => void;
  private readonly _audioElement: HTMLAudioElement;
  private readonly _currentTtsFilePath = ref<string | null>(null);
  private readonly _audioWatchStopHandle: () => void;
  private readonly _audioPlaying = ref(false);

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
            console.log(
              "New driver config is empty, or TTS is disabled, destroying the driver",
              agent,
              ttsConfig,
            );

            this.ttsDriver.value.destroy();
            this.ttsDriver.value = null;
          }
        }
      },
      {
        deep: true,
      },
    );

    this._audioElement = new Audio();
    this._audioWatchStopHandle = watchImmediate(
      () => storage.speechVolumeStorage.value,
      (volume) => (this._audioElement.volume = volume / 100),
    );
  }

  /**
   * Create a new Text-To-Speech job.
   */
  createTtsJob(characterId: string | null, text: string) {
    // Remove `*` from the text.
    text = text.replace(/\*/g, "");
    return new VoicerJob(characterId, text, this, this.scenario);
  }

  /**
   * Play a TTS audio from local file.
   *
   * If this very file is already being playing, noop.
   * If the same file is paused, it will be resumed.
   * If the file is different, the current file will be stopped
   * and the new file will be played.
   *
   * @param filePath Path to the audio file.
   */
  async playTts(filePath: string) {
    let tweenPromise: Promise<void> | undefined;

    if (this._currentTtsFilePath.value === filePath) {
      return this._startAudioGracefully();
    } else {
      tweenPromise = this._stopAudioGracefully();
      this._currentTtsFilePath.value = filePath;
    }

    const fileUrl = convertFileSrc(filePath);
    const wav = await fetch(fileUrl).then((res) => res.arrayBuffer());
    if (tweenPromise) await tweenPromise;

    this._audioElement.src = URL.createObjectURL(
      new Blob([wav], { type: "audio/wav" }),
    );

    this._audioElement.onpause = () => {
      this._audioPlaying.value = false;
    };

    return this._startAudioGracefully();
  }

  /**
   * Stop the currently playing TTS audio.
   * @param filePath If provided, only pause the audio if it's the same file.
   */
  stopTts(filePath?: string) {
    if (filePath) {
      if (this._currentTtsFilePath.value === filePath) {
        console.log("Stopping TTS audio", filePath);
        this._stopAudioGracefully();
      }
    } else {
      console.log("Stopping all TTS audio");
      this._stopAudioGracefully();
    }
  }

  destroy() {
    console.debug("Destroying Voicer");

    this._driverConfigWatchStopHandle();

    if (this.ttsDriver.value) {
      this.ttsDriver.value.destroy();
      this.ttsDriver.value = null;
    }

    this._audioWatchStopHandle();
    this._audioElement.pause();
    this._audioPlaying.value = false;
  }

  /**
   * Fade the volume of the audio element.
   */
  private async _tweenVolume(
    from: number,
    to: number,
    duration: number,
    interval = 10,
  ): Promise<void> {
    const steps = duration / interval;
    const step = Math.abs((to - from) / steps);

    let volume = from;
    for (let i = 0; i < steps; i++) {
      volume += step;
      this._audioElement.volume = volume / 100;
      await sleep(interval);
    }

    this._audioElement.volume = to / 100;
  }

  private async _stopAudioGracefully(duration = 500): Promise<void> {
    if (this._audioElement.paused) return;

    return this._tweenVolume(
      storage.speechVolumeStorage.value,
      0,
      duration,
    ).then(() => {
      this._audioElement.pause();
      this._audioElement.currentTime = 0;
      this._audioPlaying.value = false;
    });
  }

  private async _startAudioGracefully(duration = 250) {
    if (!this._audioElement.paused) return;

    this._audioElement.volume = 0;
    await this._audioElement.play();
    this._audioPlaying.value = true;
    return this._tweenVolume(0, storage.speechVolumeStorage.value, duration);
  }
}
