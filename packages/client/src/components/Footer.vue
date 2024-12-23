<script setup lang="ts">
import discordRaw from "@/assets/discord.svg?raw";
import redditRaw from "@/assets/reddit.svg?raw";
import xRaw from "@/assets/x.svg?raw";
import { env } from "@/env";
import * as tauriShell from "@tauri-apps/plugin-shell";

async function onUrlClick() {
  await tauriShell.open(env.VITE_WEB_BASE_URL);
}
</script>

<template lang="pug">
footer.flex.flex-col.items-center.gap-1
  .flex.gap-3
    //- Discord URL.
    span.cursor-pointer.transition-transform.pressable(
      v-if="env.VITE_DISCORD_URL"
      class="hover:text-[#5865F2]"
      @click="tauriShell.open(env.VITE_DISCORD_URL)"
    )
      svg.h-5.w-5.fill-current(v-html="discordRaw")

    //- Reddit URL.
    span.cursor-pointer.transition-transform.pressable(
      v-if="env.VITE_REDDIT_URL"
      class="hover:text-[#FF4500]"
      @click="tauriShell.open(env.VITE_REDDIT_URL)"
    )
      svg.h-5.w-5.fill-current(v-html="redditRaw")

    //- X (Twitter) URL.
    span.cursor-pointer.transition-transform.pressable(
      v-if="env.VITE_X_URL"
      class="hover:text-[#000000]"
      @click="tauriShell.open(env.VITE_X_URL)"
    )
      svg.h-5.w-5.fill-current(v-html="xRaw")

  .flex.flex-col.items-center
    span.text-sm.leading-snug
      | 2024 ©
      |
      a(href="#" class="hover:link" @click="onUrlClick") Simularity AI
    span.text-xs.leading-snug.opacity-80 v{{ env.VITE_VERSION }} ({{ env.VITE_COMMIT_HASH }})
</template>
