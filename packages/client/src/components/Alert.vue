<script setup lang="ts">
import { unreachable } from "@/lib/utils";
import { CircleAlertIcon, InfoIcon } from "lucide-vue-next";
import { computed } from "vue";

const props = defineProps<{
  type: "info" | "warn";
}>();

const iconComponent = computed(() => {
  switch (props.type) {
    case "info":
      return InfoIcon;
    case "warn":
      return CircleAlertIcon;
    default:
      throw unreachable(props.type);
  }
});

const iconClass = computed(() => {
  switch (props.type) {
    case "info":
      return "text-blue-500";
    case "warn":
      return "text-warn-500";
    default:
      throw unreachable(props.type);
  }
});

const textClass = computed(() => {
  switch (props.type) {
    case "info":
      return "";
    case "warn":
      return "text-warn-500";
    default:
      throw unreachable(props.type);
  }
});
</script>

<template lang="pug">
.flex.gap-2.rounded-b-lg.rounded-tr-lg.border.bg-neutral-50.p-2
  slot(name="icon")
    component.shrink-0(:is="iconComponent" :size="20" :class="iconClass")
  p.text-sm.leading-tight(:class="textClass")
    slot
</template>
