import { d } from "@/lib/drizzle";
import { ref, shallowRef, ShallowRef } from "vue";

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
        >;
        directorUpdate?: Pick<
          typeof d.directorUpdates.$inferSelect,
          "id" | "code" | "preference" | "createdAt"
        > | null;
      }[]
    > = shallowRef([]),
    chosenVariantIndex = 0,
  ) {
    this.chosenVariantIndex.value = chosenVariantIndex;
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
