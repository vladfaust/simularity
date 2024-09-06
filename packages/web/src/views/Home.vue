<script setup lang="ts">
import HeaderVue from "@/components/Header.vue";

const patreonUrl = import.meta.env.VITE_PATREON_CAMPAIGN_URL;
const discordUrl = import.meta.env.VITE_DISCORD_URL;
const xUrl = import.meta.env.VITE_TWITTER_URL;
const downloadUrl = import.meta.env.VITE_DOWNLOAD_DARWIN_ARM64_URL;
</script>

<template lang="pug">
.flex.flex-col.items-center
  HeaderVue.w-full.border-b
  .flex.w-full.max-w-xl.flex-col.gap-2.p-3
    p.leading-snug Simularity is a local-first AI-powered simulation engine comprising multiple AI agents responsible for rendering an immersive experience.
    p.leading-snug Currently, Simularity renders flat 2D worlds, making it the first of its kind truly interactive Visual Novel engine.
    iframe.mt-1.aspect-video.w-full(
      src="https://www.youtube.com/embed/FvOl_GSvuzY?si=zzqf5aa92sMiTwr7"
      title="YouTube video player"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    )
    p.leading-snug Currently, only MacOS M-series chip is supported.
    a.dz-btn.dz-btn-primary(:href="downloadUrl") 🍎 Download .dmg
    p.leading-snug
      | AI agents run locally
      |
      i (right now, the TTS agent can only run in the cloud, but it'll be fixed soon)
      | , ensuring full privacy and security. On my Mac M1 16GB, a 7B Kunoichi model runs at 10 tokens per second, which is enough for a smooth experience.
    p.leading-tight Alternatively, agents may run in the cloud.
    p.leading-snug You can support the development of Simularity by subscribing to Patreon (includes cloud credits) and, of course, spread the word!
    a.dz-btn.dz-btn-secondary(:href="patreonUrl" target="_blank") 🎉 Support on Patreon 🎉
    p.leading-snug Join the Discord server to get the latest updates, support and chat with the community.
    .flex.flex-wrap.gap-2
      a.dz-btn.dz-btn-primary(:href="discordUrl" target="_blank") Join Discord
      a.dz-btn.dz-btn-primary(:href="xUrl" target="_blank") Subscribe to 𝕏
</template>
