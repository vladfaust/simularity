import { d } from "@/lib/drizzle";
import { computed, ref } from "vue";

/**
 * An assistant-generated update can be edited, or regenerated.
 */
export class AssistantUpdate {
  readonly chosenVariantIndex = ref(0);
  readonly inProgressVariantText = ref<string | null>(null);
  readonly newVariantInProgress = computed(
    () => this.inProgressVariantText.value !== null,
  );

  static is(obj: any): obj is AssistantUpdate {
    return obj instanceof AssistantUpdate;
  }

  constructor(
    readonly parentId: string | null,
    public variants: (Pick<
      typeof d.writerUpdates.$inferSelect,
      "id" | "text" | "createdAt"
    > & {
      directorUpdate: Pick<
        typeof d.directorUpdates.$inferSelect,
        "id" | "code" | "createdAt"
      > | null;
    })[],
    chosenVariantIndex = 0,
  ) {
    this.chosenVariantIndex.value = chosenVariantIndex;
  }

  get chosenVariant() {
    const variant = this.variants.at(this.chosenVariantIndex.value);

    if (!variant) {
      throw new Error("Chosen variant index out of bounds.");
    } else {
      return variant;
    }
  }
}
