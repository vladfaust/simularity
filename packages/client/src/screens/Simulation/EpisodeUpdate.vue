<script lang="ts">
/**
 * An episode (i.e. predefined) update.
 */
export class EpisodeUpdate {
  static is(obj: any): obj is EpisodeUpdate {
    return obj instanceof EpisodeUpdate;
  }

  constructor(
    readonly id: string,
    readonly parentId: string | null,
    readonly episodeId: string,
    readonly chunkIndex: number,
    readonly text: string,
    readonly directorUpdate: Pick<
      typeof d.directorUpdates.$inferSelect,
      "id" | "code" | "createdAt"
    > | null,
  ) {}
}
</script>

<script setup lang="ts">
import { d } from "@/lib/drizzle";

defineProps<{
  update: EpisodeUpdate;
}>();
</script>

<template lang="pug">
p.rounded-lg.rounded-bl-none.bg-white.px-3.py-3.leading-snug.opacity-90.transition-opacity(
  class="hover:opacity-100"
) {{ update.text }}
</template>
