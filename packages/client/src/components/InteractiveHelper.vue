<script setup lang="ts">
defineProps<{
  showBackground: boolean;
}>();
</script>

<template lang="pug">
.relative.overflow-hidden
  //- Background.
  //- img.absolute.left-0.top-0.z-0.h-full.w-full.scale-105.object-cover.blur(
  //-   v-if="showBackground"
  //-   src="/img/helper/bg.png"
  //- )
  .flex.items-end.gap-3.px-3.pt-3
    //- //- Avatar.
    //- img.z-10.w-64.object-contain(src="/img/helper/avatar.png" class="max-w-[33%]")

    //- Content.
    .z-10.mb-3.flex.flex-col.gap-2
      slot(name="default")
</template>
