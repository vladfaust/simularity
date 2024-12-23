<script setup lang="ts">
import discordRaw from "@/assets/discord.svg?raw";
import redditRaw from "@/assets/reddit.svg?raw";
import xRaw from "@/assets/x.svg?raw";
import { env } from "@/env";
import { routeLocation } from "@/router";
import { userId } from "@/store";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  TransitionRoot,
} from "@headlessui/vue";
import {
  CircleDollarSignIcon,
  DownloadIcon,
  LibraryBigIcon,
  LogInIcon,
  MenuIcon,
  XIcon,
} from "lucide-vue-next";
import UserPfp from "./UserPfp.vue";
</script>

<template lang="pug">
Menu(v-slot="{ open }")
  .flex.flex-col
    //- Top row (always visible).
    .flex.justify-center.p-3
      .flex.w-full.max-w-4xl.items-center.justify-between.gap-2
        .flex.h-full.shrink-0.items-center.gap-3
          .py-1
            RouterLink.contents(:to="routeLocation({ name: 'Home' })")
              img.-mb-1.h-8.transition-transform.pressable(
                src="/img/logo.svg"
                alt="Logo"
              )

          .hidden(class="xs:contents")
            RouterLink._router-link(:to="routeLocation({ name: 'Download' })")
              DownloadIcon(:size="20")
              span Download

          //- Social media links.
          .flex.gap-2
            //- Discord URL.
            a(
              v-if="env.VITE_DISCORD_URL"
              :href="env.VITE_DISCORD_URL"
              class="hover:text-[#5865F2]"
              target="_blank"
            )
              svg.h-5.w-5.fill-current(v-html="discordRaw")

            //- Reddit URL.
            a(
              v-if="env.VITE_REDDIT_URL"
              :href="env.VITE_REDDIT_URL"
              class="hover:text-[#FF4500]"
              target="_blank"
            )
              svg.h-5.w-5.fill-current(v-html="redditRaw")

            //- X (Twitter) URL.
            a(
              v-if="env.VITE_X_URL"
              :href="env.VITE_X_URL"
              class="hover:text-[#000000]"
              target="_blank"
            )
              svg.h-5.w-5.fill-current(v-html="xRaw")

        .hidden.h-full.w-full.items-center.justify-end.gap-3(class="xs:flex")
          RouterLink._router-link(:to="routeLocation({ name: 'Pricing' })")
            CircleDollarSignIcon(:size="20")
            span Pricing

          template(v-if="userId")
            RouterLink._router-link(
              :to="routeLocation({ name: 'User', params: { userId } })"
            )
              UserPfp.aspect-square.h-6.rounded-full.object-cover.shadow-lg(
                :user-id
              )
              | Profile

          template(v-else)
            RouterLink._router-link(:to="routeLocation({ name: 'Login' })")
              LogInIcon(:size="20")
              | Login

        .flex.items-center(class="xs:hidden")
          MenuButton.btn-pressable.grid.aspect-square.h-9.place-items-center.rounded-lg.border
            TransitionRoot.absolute(
              :show="open"
              enter="duration-100 ease-out"
              enter-from="scale-0 opacity-0"
              enter-to="scale-100 opacity-100"
              leave="duration-100 ease-in"
              leave-from="scale-100 opacity-100"
              leave-to="scale-0 opacity-0"
            )
              XIcon(:size="20")
            TransitionRoot.absolute(
              :show="!open"
              enter="duration-100 ease-out"
              enter-from="scale-0 opacity-0"
              enter-to="scale-100 opacity-100"
              leave="duration-100 ease-in"
              leave-from="scale-100 opacity-100"
              leave-to="scale-0 opacity-0"
            )
              MenuIcon(:size="20")

    //- Dropdown menu.
    Transition(
      v-show="open"
      enter-active-class="transition duration-100 ease-out origin-top"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-75 ease-out origin-top"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    )
      .relative.z-10
        MenuItems.absolute.flex.w-full.flex-col.divide-y.overflow-hidden.rounded-b-lg.border-t.bg-white.shadow-lg(
          static
        )
          MenuItem
            RouterLink._dropdown-link(
              :to="routeLocation({ name: 'Download' })"
            )
              ._icon-container
                DownloadIcon(:size="20")
              span Download app

          MenuItem
            RouterLink._dropdown-link(:to="routeLocation({ name: 'Home' })")
              ._icon-container
                LibraryBigIcon(:size="20")
              span
                | Library

          MenuItem
            RouterLink._dropdown-link(:to="routeLocation({ name: 'Pricing' })")
              ._icon-container
                CircleDollarSignIcon(:size="20")
              span
                | Pricing

          MenuItem
            template(v-if="userId")
              RouterLink._dropdown-link(
                :to="routeLocation({ name: 'User', params: { userId } })"
              )
                ._icon-container
                  UserPfp.aspect-square.h-5.rounded-full.object-cover.shadow-lg(
                    :user-id
                  )
                span
                  | Profile

            template(v-else)
              RouterLink._dropdown-link(:to="routeLocation({ name: 'Login' })")
                ._icon-container
                  LogInIcon(:size="20")
                span
                  | Login
</template>

<style lang="postcss" scoped>
._router-link {
  @apply flex h-full items-center gap-2 rounded-lg border px-3 font-semibold transition pressable;
  @apply hover:text-primary-500;

  &.router-link-active {
    @apply border-primary-500 text-primary-500;
  }
}

._dropdown-link {
  @apply flex items-center gap-2 p-3 font-semibold;
  @apply hover:bg-neutral-100;
  @apply transition-transform pressable-sm;

  ._icon-container {
    @apply rounded-lg border p-1;
  }

  &.router-link-active {
    @apply border-l-4 border-l-primary-500 text-primary-500;
  }
}
</style>
