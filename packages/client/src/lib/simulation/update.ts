import { d } from "@/lib/drizzle";
import { ref, shallowRef, type ShallowRef } from "vue";
import type { StateDto } from "./state";

export class Update {
  readonly chosenVariantIndex = ref(0);

  readonly inProgressVariant = ref<
    | {
        characterId?: string | null;
        clockString?: string;
        text: string;
      }
    | undefined
  >();

  constructor(
    readonly parentId: string | null | undefined,
    public variants: ShallowRef<
      {
        writerUpdate: Pick<
          typeof d.writerUpdates.$inferSelect,
          | "id"
          | "llmCompletionId"
          | "nextUpdateId"
          | "checkpointId"
          | "didConsolidate"
          | "characterId"
          | "simulationDayClock"
          | "text"
          | "createdByPlayer"
          | "episodeId"
          | "episodeChunkIndex"
          | "preference"
          | "createdAt"
        > & {
          completion?: Pick<
            typeof d.llmCompletions.$inferSelect,
            "inputLength" | "outputLength"
          > | null;
        };

        /**
         * The director update, if any.
         * Null means there is no director update for this writer update.
         * Undefined means the director update is not fetched yet.
         */
        directorUpdate?: Pick<
          typeof d.directorUpdates.$inferSelect,
          "id" | "code" | "preference" | "createdAt"
        > | null;

        /**
         * The state of the simulation at the time of the update, if known.
         */
        state?: StateDto;

        ttsAudioElement?: HTMLAudioElement;
      }[]
    > = shallowRef([]),
    chosenVariantIndex = 0,
  ) {
    this.chosenVariantIndex.value = chosenVariantIndex;
  }

  get completionLength(): number | undefined {
    const chosenVariant = this.chosenVariant;
    if (!chosenVariant) return undefined;

    const completion = chosenVariant.writerUpdate.completion;
    if (!completion) return undefined;

    if (completion.inputLength === null || completion.outputLength === null) {
      return undefined;
    }

    return completion.inputLength + completion.outputLength;
  }

  get chosenVariant() {
    return this.variants.value.at(this.chosenVariantIndex.value);
  }

  /**
   * Ensure that the chosen variant is defined.
   * @throws {Error} If the chosen variant is undefined.
   */
  get ensureChosenVariant() {
    const chosenVariant = this.chosenVariant;
    if (!chosenVariant) throw new Error("Chosen variant undefined");
    return chosenVariant;
  }

  /**
   * Set the chosen variant to the last one.
   * @throws {Error} If there are no variants.
   */
  setChosenVariantToLast() {
    if (this.variants.value.length === 0) throw new Error("No variants");
    this.chosenVariantIndex.value = this.variants.value.length - 1;
  }
}
