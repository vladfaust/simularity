<script lang="ts">
/**
 * A user-generated update.
 */
export class UserUpdate {
  readonly chosenVariantIndex = ref(0);

  static is(obj: any): obj is UserUpdate {
    return obj instanceof UserUpdate;
  }

  constructor(
    readonly parentId: string | null,
    readonly variants: Pick<
      typeof d.writerUpdates.$inferSelect,
      "id" | "text" | "createdAt"
    >[],
    chosenVariantIndex = 0,
  ) {
    this.parentId = parentId;
    this.variants = variants;
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
</script>

<script setup lang="ts">
import { d } from "@/lib/drizzle";
import { ref } from "vue";

defineProps<{
  update: UserUpdate;
}>();
</script>

<template lang="pug">
p.place-self-end.rounded-lg.rounded-br-none.bg-white.px-3.py-3.leading-snug.opacity-90.transition-opacity(
  class="hover:opacity-100"
) {{ update.chosenVariant.text }}
</template>
