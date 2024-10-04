<script setup lang="ts">
import EpisodeCard from "@/components/EpisodeCard.vue";
import ImmersiveModeIcon from "@/components/Icons/ImmersiveModeIcon.vue";
import NsfwIcon from "@/components/NsfwIcon.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import ScenarioCard from "@/components/ScenarioCard.vue";
import ScenarioDetails from "@/components/ScenarioDetails.vue";
import * as api from "@/lib/api";
import { Download, downloadManager } from "@/lib/downloads";
import { d } from "@/lib/drizzle";
import { defaultScenariosDir, MANIFEST_FILE_NAME } from "@/lib/scenario";
import * as tauri from "@/lib/tauri";
import { remoteScenarioAssetUrl } from "@/logic/scenarios";
import {
  localScenarioQueryKey,
  localScenariosQueryKey,
  untilFetched,
  useLocalScenarioQuery,
  useRemoteScenarioQuery,
} from "@/queries";
import { useQueryClient } from "@tanstack/vue-query";
import { fs, path } from "@tauri-apps/api";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  BookIcon,
  DownloadIcon,
  DramaIcon,
  FolderIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  ScrollTextIcon,
  TrophyIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import { computed, onMounted, shallowRef } from "vue";
import { scenarioAssets } from "../../../../api/dist/lib/schema/scenarios";
import Achievement from "./Scenario/Achievement.vue";
import Character from "./Scenario/Character.vue";

const queryClient = useQueryClient();

const props = defineProps<{
  scenarioId: string;
}>();

defineEmits<{
  (event: "back"): void;
  (event: "newGame", episodeId?: string): void;
}>();

const { query: localScenarioQuery, data: localScenario } =
  useLocalScenarioQuery(props.scenarioId, { throwOnError: true });

const { query: remoteScenarioQuery, data: remoteScenario } =
  useRemoteScenarioQuery(props.scenarioId);

const scenario = computed(() => localScenario.value ?? remoteScenario.value);
const saves = shallowRef<Pick<typeof d.simulations.$inferSelect, "id">[]>([]);

const download = shallowRef<Download | null>();

async function showInFileManager() {
  if (!localScenario.value) {
    console.warn("No scenario to show in file manager");
    return;
  }

  await tauri.utils.fileManagerOpen(localScenario.value.basePath);
}

async function beginDownload(scenarioVersion?: number) {
  if (!remoteScenario.value) {
    throw new Error("No remote scenario to download");
  }

  scenarioVersion ??= remoteScenario.value.version;

  const scenariosDir = await defaultScenariosDir();
  const id = `${scenarioVersion}.${props.scenarioId}.scenario`;
  const downloadPath = await path.join(scenariosDir, `${id}.download`);

  console.log("Fetching asset map for scenario", {
    scenarioId: props.scenarioId,
    scenarioVersion,
  });

  const assetMap = await api.trpc.commandsClient.scenarios.getAssetMap.query({
    scenarioId: props.scenarioId,
    scenarioVersion,
  });

  if (localScenario.value) {
    let localScenarioAssetSize = 0;

    for (const { asset } of scenarioAssets(localScenario.value.manifest)) {
      localScenarioAssetSize += asset.size ?? 0;
      if (assetMap[asset.path] && assetMap[asset.path].hash === asset.hash) {
        console.log("Skipping download of asset", asset.path);
        delete assetMap[asset.path];
      }
    }

    console.debug(
      "Local scenario asset size",
      prettyBytes(localScenarioAssetSize),
    );
  }

  console.log("Downloading scenario", {
    scenarioId: props.scenarioId,
    scenarioVersion,
    assets: Object.keys(assetMap).length,
    size: prettyBytes(
      Object.values(assetMap).reduce((sum, { size }) => sum + size, 0),
    ),
  });

  const scenarioDir = await path.join(scenariosDir, props.scenarioId);
  console.log("Creating scenario directory if not exist", { scenarioDir });
  await fs.createDir(scenarioDir, { recursive: true });

  download.value = await downloadManager.create(downloadPath, [
    {
      targetPath: await path.join(
        scenariosDir,
        props.scenarioId,
        MANIFEST_FILE_NAME,
      ),
      url: remoteScenarioAssetUrl(
        props.scenarioId,
        scenarioVersion,
        MANIFEST_FILE_NAME,
      ),
    },
    ...(await Promise.all(
      Object.entries(assetMap).map(async ([assetPath, asset]) => ({
        targetPath: await path.join(scenariosDir, props.scenarioId, assetPath),
        url: remoteScenarioAssetUrl(
          props.scenarioId,
          scenarioVersion,
          assetPath,
        ),
        hashes: { sha256: asset.hash },
        size: asset.size,
      })),
    )),
  ]);

  download.value.onComplete(async () => {
    console.log("Download completed", { id });

    await queryClient.invalidateQueries({
      queryKey: localScenarioQueryKey(props.scenarioId),
    });

    await queryClient.invalidateQueries({
      queryKey: localScenariosQueryKey(),
    });

    download.value = null;
    downloadManager.downloads.delete(download.value!.metaPath);
  });
}

onMounted(async () => {
  const regex = RegExp(`^(?<version>\\d+).${props.scenarioId}.scenario$`);

  for (const instance of await downloadManager.readDir(
    await defaultScenariosDir(),
  )) {
    const match = instance.id.match(regex);

    if (match) {
      const version = parseInt(match.groups!.version);
      console.log("Found download for scenario", { version });
      download.value = instance;
      break;
    }
  }

  if (!download.value) {
    console.log("No downloads found for scenario");
    download.value = null;
  } else {
    download.value.onComplete(async () => {
      console.log("Download completed", { id: download.value!.id });

      await queryClient.invalidateQueries({
        queryKey: localScenarioQueryKey(props.scenarioId),
      });

      await queryClient.invalidateQueries({
        queryKey: localScenariosQueryKey(),
      });

      downloadManager.downloads.delete(download.value!.metaPath);
      download.value = null;
    });
  }

  await Promise.all([
    untilFetched(localScenarioQuery),
    untilFetched(remoteScenarioQuery),
  ]);

  if (localScenario.value) {
    if (remoteScenario.value) {
      if (remoteScenario.value.version > localScenario.value.content.version) {
        console.log("Remote scenario is newer than local scenario", {
          local: localScenario.value.content.version,
          remote: remoteScenario.value.version,
        });
      }
    }
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
.flex.flex-col
  RichTitle.border-b.p-3(:title="scenario?.name")
    template(#icon)
      BookIcon(:size="20")
    template(#extra)
      .flex.items-center.gap-1
        .cursor-help.rounded-lg.border.border-dashed.p-1.text-pink-500(
          v-if="scenario?.nsfw"
          v-tooltip="'This scenario is NSFW'"
        )
          NsfwIcon.text-pink-500(:size="18")

        .cursor-help.rounded-lg.border.border-dashed.p-1(
          v-if="scenario?.immersive"
          v-tooltip="'This scenario supports immersive mode'"
        )
          ImmersiveModeIcon(:size="18")

        button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
          v-if="localScenario && !localScenario?.builtin"
          @click="showInFileManager"
          v-tooltip="'Show in file manager'"
        )
          FolderIcon(:size="18")

  ._main.grid.h-full.w-full(v-if="scenario")
    //- Content section.
    section._content.flex.h-full.w-full.flex-col.gap-2.p-3(
      style="grid-area: content"
      class="@container"
    )
      template(v-if="Object.keys(scenario.episodes).length > 1")
        //- Episodes.
        RichTitle(title="Episodes")
          template(#icon)
            ScrollTextIcon(:size="18")
          template(#extra)
            span {{ Object.keys(scenario.episodes).length }}

        //- Episodes grid.
        .grid.w-full.grid-cols-3.gap-2
          //- TODO: New game modal offers download if not yet downloaded.
          EpisodeCard.cursor-pointer.overflow-hidden.rounded-lg.border-4.border-white.bg-white.shadow-lg.transition-transform.pressable(
            v-for="[episodeId, episode] in Object.entries(scenario.episodes)"
            :key="episodeId"
            :scenario
            :episodeId
            :episode
            @click="$emit('newGame', episodeId)"
          )

      template(
        v-if="scenario.achievements && Object.values(scenario.achievements).length"
      )
        //- Achievements.
        RichTitle(title="Achievements")
          template(#icon)
            TrophyIcon(:size="18")
          template(#extra)
            span {{ scenario.achievements.length }}

        //- Achievements grid.
        ul.grid.w-full.gap-2
          li(v-for="achievement of Object.values(scenario.achievements)")
            Achievement.rounded-lg.border-4.border-white.bg-white.shadow-lg(
              :scenario
              :achievement
            )

      //- Characters.
      RichTitle(title="Characters")
        template(#icon)
          DramaIcon(:size="18")
        template(#extra)
          span {{ Object.keys(scenario.characters).length }}

      //- Characters grid.
      .grid.gap-2(class="@sm:grid-cols-2")
        Character.overflow-hidden.rounded-lg.border-4.border-white.bg-white.shadow-lg(
          v-for="[characterId, character] in Object.entries(scenario.characters)"
          :key="characterId"
          :scenario
          :character-id
          :character
        )

    //- Side section.
    section._side.h-full.gap-3.border-r.p-3(style="grid-area: side")
      .flex.flex-col.gap-3(style="grid-area: scenario")
        ScenarioCard._scenario-card.h-full.shrink.cursor-pointer.rounded-lg.border-4.border-white.shadow-lg.transition-transform.pressable-sm(
          :scenario
          layout="grid"
          :narrow-padding="true"
          :always-hide-details="true"
          @click="$emit('back')"
        )

      .flex.flex-col.gap-3(style="grid-area: content")
        ScenarioDetails.gap-2.rounded-lg.bg-white.p-3.shadow-lg(
          :scenario
          :show-attributes="true"
        )

        //- TODO: Pause on click (shall implement download concurrency limit).
        .flex(v-if="download" class="gap-1.5")
          .btn.btn-md.w-full.rounded-lg.border.border-dashed(v-if="download")
            Loader2Icon.animate-spin(v-if="!download.paused.value" :size="20")
            span.text-sm {{ prettyBytes(download.totalFileSize.value ?? 0) }} ({{ Math.round(download.progress.value * 100) }}%)

          button.btn-pressable.btn.aspect-square.rounded-lg.border.p-3(
            @click="download.paused.value ? download.resume() : download.pause()"
            class="hover:bg-white hover:text-primary-500"
          )
            PlayIcon(v-if="download.paused.value" :size="18")
            PauseIcon(v-else :size="18")

        template(v-else-if="localScenario")
          button.btn-pressable.btn.btn-primary.btn-md.rounded-lg(
            @click="$emit('newGame')"
          )
            | Play now

          button.btn-pressable.btn.btn-sm.rounded-lg.bg-white(
            v-if="remoteScenario && localScenario.version < remoteScenario.version"
            @click="beginDownload()"
          )
            | Update

        button.btn-pressable.btn.btn-primary.btn-md.rounded-lg(
          v-else-if="remoteScenario && download !== undefined"
          @click="beginDownload()"
        )
          DownloadIcon(:size="20")
          span Download ({{ prettyBytes(remoteScenario.downloadSize) }})
</template>

<style lang="postcss" scoped>
$breakpoint: 1280px;

@media (max-width: $breakpoint) {
  ._main {
    grid-template-areas: "side" "content";
    @apply overflow-y-scroll;
  }

  ._side {
    @apply grid border-b;
    grid-template-areas: "scenario scenario content content content";
    @apply grid-cols-5;
  }
}

@media (min-width: $breakpoint) {
  ._main {
    grid-template-areas: "side content content content";
    @apply grid-cols-4;
  }

  ._side {
    @apply flex flex-col overflow-y-scroll;
  }
}
</style>
