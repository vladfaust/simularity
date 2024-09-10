<script setup lang="ts">
import HeaderVue from "@/components/Header.vue";

const patreonUrl = import.meta.env.VITE_PATREON_CAMPAIGN_URL;
const discordUrl = import.meta.env.VITE_DISCORD_URL;
const redditUrl = import.meta.env.VITE_REDDIT_URL;
const xUrl = import.meta.env.VITE_TWITTER_URL;
const downloadUrl = import.meta.env.VITE_DOWNLOAD_DARWIN_ARM64_URL;
</script>

<template lang="pug">
.flex.flex-col.items-center
  HeaderVue.w-full.border-b
  .flex.w-full.max-w-2xl.flex-col.gap-2.p-3
    p.text-lg.font-medium.leading-snug
      | Simularity AI (or simply,
      |
      i Simularity
      | ) is a
      |
      b.underline local-first
      | ,&nbsp;
      span.underline free
      |
      | and
      |
      span.underline easy-to-use
      |
      | AI-powered simulation engine comprising multiple AI agents responsible for rendering an immersive experience.

    p.leading-snug Simularity allows to play in the classic chat mode, or render flat 2D worlds, making it the first of its kind truly interactive Visual Novel engine.
    p.leading-snug
      | You can download a scenario and run it locally, or mix it with cloud inference endpoints for optimal performance.
      | Scenario includes a story, characters, and a world, all of which are customizable.

    .flex.items-center.justify-between.gap-2
      h2.shrink-0.text-lg.font-semibold 💬 Chat mode
      .w-full.border-b

    p.leading-snug Chat mode is a fast, resource-efficient way to interact with your favorite AI characters. It features a simple text-based interface and is perfect for quick interactions.

    iframe.my-1.aspect-video.w-full(
      src="https://www.youtube.com/embed/CFIA9X39cUA?si=2p_nSx72-rX5qXeG"
      title="Simularity AI Chat mode demo"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    )

    .flex.items-center.justify-between.gap-2
      h2.shrink-0.text-lg.font-semibold 🖼️ Visual Novel mode
      .w-full.border-b

    p.leading-snug An alternative to Chat mode, Visual Novel mode is a more immersive way to interact with AI characters. It features character expressions, outfits, dynamic scenes with ambience, and more. Visual Novel mode requires more resources to calculate scene updates.

    p.leading-snug With a potential to track events, quests and achievements, this opens up a whole new world of possibilities for game developers and storytellers.

    iframe.my-1.aspect-video.w-full(
      src="https://www.youtube.com/embed/iIuxUJkCPgU?si=putJgnNifPLl3z74"
      title="Simularity AI Visual Novel mode demo"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    )

    .flex.items-center.justify-between.gap-2
      h2.shrink-0.text-lg.font-semibold 🍞 Current state
      .w-full.border-b

    p.leading-snug
      | We're proud to introduce you the initial relase of Simularity!
      | There is still a long way to go, but it is already playable and fun.
      | Currently, the application runs on MacOS M-series chips only, but soon we will release versions for other platforms.

    .flex.items-center.justify-between.gap-2
      h2.shrink-0.font-semibold 🚧 Roadmap
      .w-full.border-b

    ul.flex.flex-col.gap-1
      li.flex.flex-col
        .flex.gap-1
          input#todo1(type="checkbox" disabled)
          label.text-lg.font-medium(for="todo1") Web, Windows, Linux, iOS &amp; Android builds.
        .flex.gap-1
          input.opacity-0(type="checkbox" disabled)
          p.leading-snug Bring Simularity to all platforms!

      li.flex.flex-col
        .flex.gap-1
          input#todo2(type="checkbox" disabled)
          label.text-lg.font-medium(for="todo2") Neural screenshots.
        .flex.gap-1
          input.opacity-0(type="checkbox" disabled)
          p.leading-snug Capture the moment with a single click; an AI artist agent will picture the scene for you. All running locally with full privacy.

      li.flex.flex-col
        .flex.gap-1
          input#todo3(type="checkbox" disabled)
          label.text-lg.font-medium(for="todo3") Scenario marketplace.
        .flex.gap-1
          input.opacity-0(type="checkbox" disabled)
          p.leading-snug Share your scenarios with the world, or download scenarios created by others.

    p.leading-snug
      | You can help us shape the future of Simularity by subscribing to our Patreon campaign, which includes custom handcrafted scenarios and cloud credits for running AI inference in the cloud.

    a.dz-btn.dz-btn-lg.bg-red-400.text-white(
      :href="patreonUrl"
      target="_blank"
    )
      | Visit our Patreon page
      img.h-6(src="/img/patreon.svg")

    .flex.items-center.justify-between.gap-2
      h2.shrink-0.text-lg.font-semibold 📥 Downloads
      .w-full.border-b

    a.dz-btn(:href="downloadUrl") Download Simularity.dmg (ARM64)

    .flex.items-center.justify-between.gap-2
      h2.shrink-0.text-lg.font-semibold 👽 Contacts
      .w-full.border-b

    .flex.flex-wrap.gap-2
      a.dz-btn(:href="discordUrl" target="_blank") Discord server
      a.dz-btn(:href="redditUrl" target="_blank") r/Simularity subreddit
      a.dz-btn(:href="xUrl" target="_blank") 𝕏
</template>
