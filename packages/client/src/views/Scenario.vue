<script setup lang="ts">
import Header from "@/components/Browser/Header.vue";
import CustomTitle from "@/components/CustomTitle.vue";
import Placeholder from "@/components/Placeholder.vue";
import { d } from "@/lib/drizzle";
import {
  ensureScenario,
  ImmersiveScenario,
  type Scenario,
} from "@/lib/simulation/scenario";
import * as tauri from "@/lib/tauri";
import { prettyNumber, replaceAsync } from "@/lib/utils";
import { routeLocation } from "@/router";
import { VueMarkdownIt } from "@f3ve/vue-markdown-it";
import { asyncComputed } from "@vueuse/core";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  ArrowLeftIcon,
  BananaIcon,
  BookMarkedIcon,
  DramaIcon,
  FolderIcon,
  Globe2Icon,
  ImageIcon,
  MonitorIcon,
  PlayCircleIcon,
  ProportionsIcon,
  ScrollTextIcon,
} from "lucide-vue-next";
import { onMounted, ref, shallowRef } from "vue";
import Saves from "./Library/Saves.vue";
import Character from "./Scenario/Character.vue";
import Episode from "./Scenario/Episode.vue";
import NewGameModal from "./Scenario/NewGameModal.vue";

const props = defineProps<{
  scenarioId: string;
}>();

const scenario = ref<Scenario | undefined>();

// Replace links in the markdown description.
const processedScenarioDescription = asyncComputed(async () => {
  if (!scenario.value?.content.description) {
    return;
  }

  // Replace links in `[text](url)` with `[text](resourceUrl(url))`.
  let desc = await replaceAsync(
    scenario.value.content.description,
    /\[([^\]]+)\]\(([^)]+)\)/g,
    async (match, text, link) => {
      console.debug(`Replacing link in ${match}`);
      const replacement = await scenario.value!.resourceUrl(link);
      console.debug(`Replaced ${link} with ${replacement}`);
      return `[${text}](${replacement})`;
    },
  );

  // Replace links in `src="url"` with `src="resourceUrl(url)"`.
  desc = await replaceAsync(desc, /src="([^"]+)"/g, async (match, link) => {
    console.debug(`Replacing src in ${match}`);
    const replacement = await scenario.value!.resourceUrl(link);
    console.debug(`Replaced ${link} with ${replacement}`);
    return `src="${replacement}"`;
  });

  return desc;
});

const thumbnailUrl = asyncComputed(() => scenario.value?.getThumbnailUrl());
const coverImageUrl = asyncComputed(() => scenario.value?.getCoverImageUrl());
const currentMediaIndex = ref(0);
const mediaUrls = asyncComputed(() => scenario.value?.getMediaUrls());
const saves = shallowRef<Pick<typeof d.simulations.$inferSelect, "id">[]>([]);
const showSaves = ref(false);
const newGameEpisodeId = ref<string | undefined>();
const newGameModal = ref(false);

async function showInFileManager() {
  if (!scenario.value) {
    console.warn("No scenario to show in file manager");
    return;
  }

  await tauri.utils.fileManagerOpen(scenario.value.basePath);
}

onMounted(async () => {
  scenario.value = await ensureScenario(props.scenarioId);

  saves.value = await d.db.query.simulations.findMany({
    columns: { id: true },
    orderBy: desc(d.simulations.updatedAt),
    where: and(
      eq(d.simulations.scenarioId, props.scenarioId),
      isNull(d.simulations.deletedAt),
    ),
  });
});
</script>

<template lang="pug">
.flex.h-screen.flex-col.overflow-y-hidden
  .flex.w-full.justify-center
    Header.h-full.w-full.max-w-4xl

  //- Subheader.
  .flex.w-full.justify-center.border-y.bg-white
    .flex.w-full.max-w-4xl.items-center.justify-between.gap-2.p-3
      //- Left side.
      .flex.items-center.gap-2
        //- Back to library button.
        RouterLink.btn.btn-square.rounded-lg.border.p-1.transition-transform.pressable(
          :to="routeLocation({ name: 'Library' })"
          title="Back to library"
        )
          ArrowLeftIcon(:size="20")

        //- Scenario name.
        h1.text-lg.font-semibold.leading-none.tracking-wide {{ scenario?.content.name }}

      //- Right side.
      button.btn.btn-sm.shrink-0.rounded-lg.border.transition-transform.pressable(
        v-if="!scenario?.builtin"
        @click="showInFileManager"
      )
        FolderIcon(:size="18")
        span Reveal in finder

  .relative.flex.h-full.w-full.flex-col.items-center.overflow-y-hidden
    //- Background image.
    img.fixed.h-full.w-full.select-none.object-cover.brightness-75(
      v-if="coverImageUrl"
      :src="coverImageUrl"
    )

    //- Content.
    .absolute.z-10.flex.h-full.w-full.flex-col.items-center.overflow-y-scroll.backdrop-blur-lg
      .flex.w-full.max-w-4xl.flex-col.gap-2.p-3(v-if="scenario")
        //- Hero section.
        .grid.grid-cols-3.gap-2
          //- Media preview.
          .col-span-2.flex.flex-col.gap-2
            //- Current media.
            img.aspect-video.w-full.rounded-lg.object-cover.transition(
              v-if="scenario.content.media?.at(currentMediaIndex)?.type === 'image' && mediaUrls"
              :src="mediaUrls[currentMediaIndex]"
              class="hover:brightness-105"
            )
            Placeholder.aspect-video.rounded-lg(v-else)

            //- Media grid.
            ul.flex.gap-2.overflow-x-scroll
              li.shrink-0.cursor-pointer.transition-transform.pressable(
                v-if="scenario.content.media?.length"
                v-for="media, i of scenario.content.media"
                style="width: calc(25% - 0.25rem)"
                @click="currentMediaIndex = i"
              )
                img.aspect-video.w-full.rounded-lg.object-cover.transition(
                  v-if="media.type === 'image' && mediaUrls"
                  :src="mediaUrls[i]"
                  class="hover:brightness-105"
                )
                Placeholder.aspect-video.rounded-lg(v-else)

              li(v-else style="width: calc(25% - 0.25rem)")
                Placeholder.aspect-video.rounded-lg

          //- Basic information.
          .flex.h-full.flex-col.divide-y.overflow-y-hidden.rounded-lg.bg-white
            img.aspect-video.w-full.select-none.object-cover(
              v-if="thumbnailUrl"
              :src="thumbnailUrl"
            )
            Placeholder.aspect-video(v-else)

            .flex.h-full.flex-col.gap-1.p-3
              CustomTitle(:title="scenario.content.name")
                template(#extra)
                  .flex.gap-1
                    BananaIcon.cursor-help(
                      v-if="scenario.content.nsfw"
                      :size="20"
                      v-tooltip="'This scenario is NSFW'"
                    )
                    MonitorIcon.cursor-help(
                      v-if="scenario instanceof ImmersiveScenario && true"
                      :size="20"
                      v-tooltip="'This scenario supports visual novel mode'"
                    )
              p.text-sm.leading-tight {{ scenario.content.about }}

        //- Actions.
        .flex.flex-col.gap-2.rounded-lg.bg-white.p-3
          //- Play button.
          button.btn-primary.btn.btn-md.btn-shadow.rounded-lg.border.transition-transform.pressable(
            @click="newGameEpisodeId = undefined; newGameModal = true"
          )
            PlayCircleIcon(:size="22" :stroke-width="2")
            span New game

          //- Recent plays.
          .flex.flex-col.gap-2(v-if="saves.length")
            Saves.w-full.gap-2(
              :expand="showSaves"
              @click-expand="showSaves = !showSaves"
              :scenario-id
            )

        //- Details section.
        .grid.grid-cols-4.gap-2
          .col-span-3.flex.w-full.flex-col.gap-2.rounded-lg.bg-white.p-3(
            class="@container"
          )
            CustomTitle(title="About")
              template(#icon)
                ScrollTextIcon(:size="18")

            article.prose-tight.prose.prose-sm.w-full.max-w-none
              VueMarkdownIt(
                v-if="processedScenarioDescription"
                :source="processedScenarioDescription"
                :options="{ html: true }"
              )

            //- Characters.
            CustomTitle(title="Characters")
              template(#icon)
                DramaIcon(:size="18")
              template(#extra)
                span {{ Object.keys(scenario.content.characters).length }}

            //- Characters grid.
            .grid.gap-2(class="@sm:grid-cols-2")
              Character.overflow-hidden.rounded-lg.border(
                v-for="[characterId, character] in Object.entries(scenario.content.characters)"
                :key="characterId"
                :scenario
                :character-id
                :character
              )

            template(v-if="Object.keys(scenario.content.episodes).length > 1")
              //- Episodes.
              CustomTitle(title="Episodes")
                template(#icon)
                  BookMarkedIcon(:size="18")
                template(#extra)
                  span {{ Object.keys(scenario.content.episodes).length }}

              //- Episodes grid.
              .grid.w-full.grid-cols-3.gap-2
                Episode.cursor-pointer.overflow-hidden.rounded-lg.border.transition-transform.pressable(
                  v-for="[episodeId, episode] in Object.entries(scenario.content.episodes)"
                  :key="episodeId"
                  :scenario
                  :episodeId
                  :episode
                  @click="newGameEpisodeId = episodeId; newGameModal = true"
                )

          //- Attributes.
          .flex.flex-col.gap-2
            .flex.flex-col.rounded-lg.bg-white.p-3
              .grid.gap-2.text-sm(style="grid-template-columns: auto auto")
                .flex.items-center.gap-1
                  Globe2Icon(:size="16")
                  span.shrink-0.font-semibold Language
                .font-mono {{ scenario.content.language }}

                .flex.cursor-help.items-center.gap-1.underline.decoration-dashed(
                  title="Minimum context size for a Large Language Model"
                )
                  ProportionsIcon(:size="16")
                  span.shrink-0.font-semibold Context
                .font-mono {{ prettyNumber(scenario.content.contextWindowSize, { space: false }) }}

                .flex.items-center.gap-1
                  DramaIcon(:size="16")
                  span.shrink-0.font-semibold Characters
                .font-mono {{ Object.keys(scenario.content.characters).length }}

                template(v-if="scenario instanceof ImmersiveScenario && true")
                  .flex.items-center.gap-1
                    ImageIcon(:size="16")
                    span.shrink-0.font-semibold Scenes
                  .font-mono {{ Object.keys(scenario.content.scenes).length }}

  NewGameModal(
    v-if="scenario"
    :open="newGameModal"
    :scenario
    :episode-id="newGameEpisodeId"
    @close="newGameModal = false"
  )
</template>
