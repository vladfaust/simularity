<script setup lang="ts">
import { Gpt } from "@/lib/ai";
import { asyncComputed, useClipboard } from "@vueuse/core";
import {
  ClipboardCheckIcon,
  ClipboardIcon,
  WrapTextIcon,
} from "lucide-vue-next";
import { ref } from "vue";

const clipboard = useClipboard();

const props = defineProps<{
  gpt: Gpt;
  content: string;
}>();

const textWrap = ref(true);
const tokenCount = asyncComputed(() => props.gpt.tokenCount(props.content));
</script>

<template lang="pug">
.flex.flex-col.overflow-hidden
  .flex.items-center.justify-between.p-2.text-white(class="bg-black/50")
    span.font-bold.uppercase.tracking-wide {{ gpt.id }} ({{ tokenCount }})
    .flex.gap-1
      button.transition-transform.pressable(@click="textWrap = !textWrap")
        WrapTextIcon(:size="20" :class="{ 'text-blue-500': !textWrap }")
      button.transition-transform.pressable(@click="clipboard.copy(content)")
        ClipboardIcon(:size="20" v-if="!clipboard.copied.value")
        ClipboardCheckIcon(:size="20" v-else)

  .flex.flex-col.overflow-x-scroll.px-3.py-2.text-white
    code.overflow-x-scroll.text-sm.leading-snug(
      :class="{ 'whitespace-pre': textWrap, 'whitespace-pre-line': !textWrap }"
    ) {{ content }}
</template>
