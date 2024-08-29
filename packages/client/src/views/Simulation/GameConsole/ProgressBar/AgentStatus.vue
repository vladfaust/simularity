<script lang="ts">
export enum Status {
  Busy,
  Waiting,
  Queued,
  Disabled,
  Done,
  Error,
}
</script>

<script setup lang="ts">
import {
  CheckIcon,
  HourglassIcon,
  Loader2Icon,
  LoaderIcon,
  MinusIcon,
} from "lucide-vue-next";

const STATUS_ICON_SIZE = 16;
const STATUS_ICON_STROKE_WIDTH = 2.5;

defineProps<{
  status: Status;
  statusText?: string;
}>();
</script>

<template lang="pug">
.flex.items-center.gap-1
  .flex.items-center.justify-center.rounded-lg.border.p-1
    slot(name="agentIcon" :size="20")

  //- Status icon.
  template(v-if="status === Status.Busy")
    LoaderIcon.animate-spin(
      :size="STATUS_ICON_SIZE"
      :stroke-width="STATUS_ICON_STROKE_WIDTH"
    )
  template(v-else-if="status === Status.Waiting")
    HourglassIcon(
      :size="STATUS_ICON_SIZE"
      :stroke-width="STATUS_ICON_STROKE_WIDTH"
    )
  template(v-else-if="status === Status.Queued")
    Loader2Icon.animate-spin(
      :size="STATUS_ICON_SIZE"
      :stroke-width="STATUS_ICON_STROKE_WIDTH"
    )
  template(v-else-if="status === Status.Disabled")
    MinusIcon.opacity-50(
      :size="STATUS_ICON_SIZE"
      :stroke-width="STATUS_ICON_STROKE_WIDTH"
    )
  template(v-else-if="status === Status.Done")
    CheckIcon(
      :size="STATUS_ICON_SIZE"
      :stroke-width="STATUS_ICON_STROKE_WIDTH"
    )

  span.text-xs(v-if="statusText") {{ statusText }}
</template>
