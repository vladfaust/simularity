import { d } from "@/lib/drizzle";
import { ref } from "vue";

export class Update {
  readonly chosenVariantIndex = ref(0);

  readonly inProgressVariant = ref<
    | {
        characterId: string | null | undefined;
        text: string;
      }
    | undefined
  >();

  constructor(
    readonly parentId: string | null | undefined,
    public variants: {
      writerUpdate: Pick<
        typeof d.writerUpdates.$inferSelect,
        | "id"
        | "characterId"
        | "text"
        | "createdByPlayer"
        | "episodeId"
        | "episodeChunkIndex"
        | "createdAt"
      >;
      directorUpdate?: Pick<
        typeof d.directorUpdates.$inferSelect,
        "id" | "code" | "createdAt"
      > | null;
    }[],
    chosenVariantIndex = 0,
  ) {
    this.chosenVariantIndex.value = chosenVariantIndex;
  }

  get chosenVariant() {
    const variant = this.variants.at(this.chosenVariantIndex.value);

    if (!variant) {
      throw new Error(
        `Chosen variant index (${this.chosenVariantIndex.value}) out of bounds (${this.variants.length})`,
      );
    } else {
      return variant;
    }
  }
}
