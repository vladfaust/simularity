<script setup lang="ts">
import Header from "@/components/Browser/Header.vue";
import CustomTitle from "@/components/CustomTitle.vue";
import Placeholder from "@/components/Placeholder.vue";
import { d } from "@/lib/drizzle";
import { Simulation } from "@/lib/simulation";
import { readScenario, Scenario } from "@/lib/simulation/scenario";
import { prettyTokens, replaceAsync } from "@/lib/utils";
import { routeLocation } from "@/router";
import { VueMarkdownIt } from "@f3ve/vue-markdown-it";
import { asyncComputed } from "@vueuse/core";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  ArrowLeftIcon,
  BrainCircuitIcon,
  ChevronDownIcon,
  DramaIcon,
  FolderIcon,
  Globe2Icon,
  HistoryIcon,
  ImageIcon,
  PlayCircleIcon,
  ProportionsIcon,
  ScrollTextIcon,
  Trash2Icon,
} from "lucide-vue-next";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Character from "./Scenario/Character.vue";
import Episode from "./Scenario/Episode.vue";
import Save from "./Scenario/Save.vue";
import { shallowRef } from "vue";
import * as resources from "@/lib/resources";

const router = useRouter();

const props = defineProps<{
  scenarioId: string;
}>();

const scenario = ref<Scenario | undefined>();

// Replace links in the markdown description.
const processedScenarioDescription = asyncComputed(async () => {
  if (!scenario.value?.description) {
    return;
  }

  // Replace links in `[text](url)` with `[text](resourceUrl(url))`.
  let desc = await replaceAsync(
    scenario.value.description,
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

async function play(episodeId?: string) {
  const simulationId = await Simulation.create(props.scenarioId, episodeId);

  router.push(
    routeLocation({
      name: "Simulation",
      params: { simulationId },
    }),
  );
}

async function deleteSave(simulationId: string) {
  if (
    !(await resources.confirm_("Are you sure you want to delete this save?", {
      title: "Delete save",
      okLabel: "Delete",
      type: "info",
    }))
  ) {
    console.log("Cancelled delete save", simulationId);
    return;
  }

  console.log("Deleting save", simulationId);
  await d.db
    .update(d.simulations)
    .set({ deletedAt: new Date() })
    .where(eq(d.simulations.id, simulationId));

  saves.value = saves.value.filter((s) => s.id !== simulationId);
}

onMounted(async () => {
  console.log("props.scenarioId", props.scenarioId);
  const read = await readScenario(props.scenarioId);

  if (read instanceof Scenario) {
    scenario.value = read;
  } else {
    throw new Error(JSON.stringify({ ...read, error: read.error.message }));
  }

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
        h1.text-lg.font-semibold.leading-none.tracking-wide {{ scenario?.name }}

      //- Right side.
      button.btn.btn-sm.shrink-0.rounded-lg.border.transition-transform.pressable(
        disabled
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
              v-if="scenario.media.at(currentMediaIndex)?.type === 'image' && mediaUrls"
              :src="mediaUrls[currentMediaIndex]"
              class="hover:brightness-105"
            )
            Placeholder.aspect-video.rounded-lg(v-else)

            //- Media grid.
            ul.flex.gap-2.overflow-x-scroll
              li.shrink-0.cursor-pointer.transition-transform.pressable(
                v-if="scenario.media.length"
                v-for="media, i of scenario.media"
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
              CustomTitle(:title="scenario.name")
              p.text-sm.leading-tight {{ scenario.about }}

        //- Actions.
        .flex.flex-col.gap-2.rounded-lg.bg-white.p-3
          //- Play button.
          button.btn-primary.btn.btn-md.btn-shadow.rounded-lg.border.transition-transform.pressable(
            @click="play()"
          )
            PlayCircleIcon(:size="22" :stroke-width="2")
            span Play {{ scenario.name }}

          //- Recent plays.
          .flex.flex-col.gap-2(v-if="saves.length")
            CustomTitle.cursor-pointer(
              title="Recent plays"
              @click="showSaves = !showSaves"
            )
              template(#icon)
                HistoryIcon(:size="18")
              template(#extra)
                .flex.items-center.gap-1
                  span {{ saves.length }}
                  .rounded.border.transition-transform.pressable
                    ChevronDownIcon.transition(
                      :size="18"
                      :class="{ '-rotate-180': showSaves }"
                    )

            ul.grid.grid-cols-4.gap-2.overflow-y-scroll.rounded-lg.bg-neutral-100.p-3.shadow-inner(
              :class="{ hidden: !showSaves }"
            )
              li.relative(v-for="simulation of saves")
                //- Delete button.
                .absolute.-right-1.-top-1.z-20
                  button.btn.rounded.bg-white.p-1.shadow.transition.pressable(
                    @click.stop="deleteSave(simulation.id)"
                    class="hover:text-red-500"
                  )
                    Trash2Icon(:size="16")

                RouterLink(
                  :to="routeLocation({ name: 'Simulation', params: { simulationId: simulation.id } })"
                )
                  Save.overflow-hidden.rounded-lg.bg-white.shadow-lg.transition-transform.pressable(
                    :simulation-id="simulation.id"
                    :key="simulation.id"
                  )

        //- Details section.
        .grid.grid-cols-4.gap-2
          .col-span-3.flex.w-full.flex-col.gap-2.rounded-lg.bg-white.p-3(
            class="@container"
          )
            CustomTitle(title="About")
              template(#icon)
                ScrollTextIcon(:size="18")

            article.prose.prose-sm.prose-tight.w-full.max-w-none
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
                span {{ Object.keys(scenario.characters).length }}

            //- Characters grid.
            .grid.gap-2(class="@sm:grid-cols-2")
              Character.overflow-hidden.rounded-lg.border(
                v-for="[characterId, character] in Object.entries(scenario.characters)"
                :key="characterId"
                :scenario
                :character-id
                :character
              )

            //- Memories.
            CustomTitle(title="Memories")
              template(#icon)
                BrainCircuitIcon(:size="18")
              template(#extra)
                span {{ Object.keys(scenario.episodes).length }}

            //- Memories grid.
            .grid.w-full.max-w-lg.gap-2(
              class="max-2xs:grid-cols-2 max-3xs:grid-cols-1 2xs:grid-cols-3"
            )
              Episode.cursor-pointer.overflow-hidden.rounded-lg.border.transition-transform.pressable(
                v-for="[episodeId, episode] in Object.entries(scenario.episodes)"
                :key="episodeId"
                :scenario
                :episodeId
                :episode
                @click="play(episodeId)"
              )

          //- Attributes.
          .flex.flex-col.gap-2
            .flex.flex-col.rounded-lg.bg-white.p-3
              .grid.gap-2.text-sm(style="grid-template-columns: auto auto")
                .flex.items-center.gap-1
                  Globe2Icon(:size="16")
                  span.shrink-0.font-semibold Language
                .font-mono {{ scenario.language }}

                .flex.cursor-help.items-center.gap-1.underline.decoration-dashed(
                  title="Minimum context size for a Large Language Model"
                )
                  ProportionsIcon(:size="16")
                  span.shrink-0.font-semibold Context
                .font-mono {{ prettyTokens(scenario.contextWindowSize, { space: false }) }}

                .flex.items-center.gap-1
                  DramaIcon(:size="16")
                  span.shrink-0.font-semibold Characters
                .font-mono {{ Object.keys(scenario.characters).length }}

                .flex.items-center.gap-1
                  ImageIcon(:size="16")
                  span.shrink-0.font-semibold Scenes
                .font-mono {{ Object.keys(scenario.scenes).length }}
</template>
