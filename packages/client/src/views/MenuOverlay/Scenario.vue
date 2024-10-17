<script setup lang="ts">
import EpisodeCard from "@/components/EpisodeCard.vue";
import ImmersiveModeIcon from "@/components/Icons/ImmersiveModeIcon.vue";
import SubscriptionIcon from "@/components/Icons/SubscriptionIcon.vue";
import NsfwIcon from "@/components/NsfwIcon.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import ScenarioCard from "@/components/ScenarioCard.vue";
import ScenarioDetails from "@/components/ScenarioDetails.vue";
import { env } from "@/env";
import * as api from "@/lib/api";
import { Download, downloadManager } from "@/lib/downloads";
import { d } from "@/lib/drizzle";
import { trackEvent, trackPageview } from "@/lib/plausible";
import { defaultScenariosDir, MANIFEST_FILE_NAME } from "@/lib/scenario";
import { appLocale } from "@/lib/storage";
import { jwtStorage } from "@/lib/storage/user";
import * as tauri from "@/lib/tauri";
import { translationWithFallback } from "@/logic/i18n";
import { remoteScenarioAssetUrl } from "@/logic/scenarios";
import {
  localScenarioQueryKey,
  localScenariosQueryKey,
  untilFetched,
  useAccountQuery,
  useLocalScenarioQuery,
  useRemoteScenarioQuery,
} from "@/queries";
import * as schema from "@simularity/api/lib/schema";
import { useQueryClient } from "@tanstack/vue-query";
import * as tauriPath from "@tauri-apps/api/path";
import * as tauriFs from "@tauri-apps/plugin-fs";
import * as tauriShell from "@tauri-apps/plugin-shell";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  BookIcon,
  DownloadIcon,
  DramaIcon,
  ExternalLinkIcon,
  FolderIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  ScrollTextIcon,
  TrophyIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import { computed, onMounted, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
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
const accountQuery = useAccountQuery();

const requiredSubscriptionTier = computed(() => {
  return remoteScenario.value?.requiredSubscriptionTier;
});

const subscriptionEnough = computed(() => {
  switch (requiredSubscriptionTier.value) {
    case "basic":
      return (
        accountQuery.data.value?.subscription?.tier === "basic" ||
        accountQuery.data.value?.subscription?.tier === "premium"
      );
    case "premium":
      return accountQuery.data.value?.subscription?.tier === "premium";
    default:
      return true;
  }
});

const saves = shallowRef<Pick<typeof d.simulations.$inferSelect, "id">[]>([]);

const download = shallowRef<Download | null>();

async function showInFileManager() {
  if (!localScenario.value) {
    console.warn("No scenario to show in file manager");
    return;
  }

  await tauri.utils.fileManagerOpen(localScenario.value.basePath);
}

function onDownloadComplete() {
  console.log("Download completed", { id: download.value!.id });

  trackEvent("scenarios/downloadComplete", {
    props: {
      scenarioId: props.scenarioId,
      scenarioVersion: remoteScenario.value?.version ?? -1,
    },
  });

  queryClient.invalidateQueries({
    queryKey: localScenarioQueryKey(props.scenarioId),
  });

  queryClient.invalidateQueries({
    queryKey: localScenariosQueryKey(),
  });

  downloadManager.downloads.delete(download.value!.metaPath);
  download.value = null;
}

async function beginDownload(scenarioVersion?: number) {
  if (!remoteScenario.value) {
    throw new Error("No remote scenario to download");
  }

  scenarioVersion ??= remoteScenario.value.version;

  const scenariosDir = await defaultScenariosDir();
  const id = `${scenarioVersion}.${props.scenarioId}.scenario`;
  const downloadPath = await tauriPath.join(scenariosDir, `${id}.download`);

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

    for (const { asset } of schema.scenarios.scenarioAssets(
      localScenario.value.manifest,
    )) {
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

  const scenarioDir = await tauriPath.join(scenariosDir, props.scenarioId);
  console.log("Creating scenario directory if not exist", { scenarioDir });
  await tauriFs.mkdir(scenarioDir, { recursive: true });

  download.value = await downloadManager.create(downloadPath, [
    {
      targetPath: await tauriPath.join(
        scenariosDir,
        props.scenarioId,
        MANIFEST_FILE_NAME,
      ),
      url: remoteScenarioAssetUrl(
        props.scenarioId,
        scenarioVersion,
        MANIFEST_FILE_NAME,
      ),
      headers: {
        Authorization: `Bearer ${jwtStorage.value}`,
      },
    },
    ...(await Promise.all(
      Object.entries(assetMap).map(async ([assetPath, asset]) => ({
        targetPath: await tauriPath.join(
          scenariosDir,
          props.scenarioId,
          assetPath,
        ),
        url: remoteScenarioAssetUrl(
          props.scenarioId,
          scenarioVersion,
          assetPath,
        ),
        headers: {
          Authorization: `Bearer ${jwtStorage.value}`,
        },
        hashes: { sha256: asset.hash },
        size: asset.size,
      })),
    )),
  ]);

  download.value.onComplete(onDownloadComplete);

  trackEvent("scenarios/downloadStart", {
    props: {
      scenarioId: props.scenarioId,
      scenarioVersion,
    },
  });
}

async function onSubscribeButtonClick() {
  const url = env.VITE_WEB_BASE_URL + "/pricing";
  console.log("Opening subscription page", url);
  await tauriShell.open(url);
}

onMounted(async () => {
  trackPageview(`/scenario/${props.scenarioId}`);

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
    download.value.onComplete(onDownloadComplete);
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

const { t } = useI18n({
  messages: {
    "en-US": {
      scenario: {
        requiredSubscriptionTier: {
          basic: "Basic subscription required",
          premium: "Premium subscription required",
        },
        nsfw: "This scenario is NSFW",
        immersive: "This scenario supports visual novel mode",
        showInFileManager: "Show in file manager",
        playNow: "Play now",
        update: "Update",
        download: "Download",
        about: "About",
        episodes: "Episodes",
        achievements: "Achievements",
        characters: "Characters",
        subscribe: "Subscribe to download",
      },
    },
    "ru-RU": {
      scenario: {
        requiredSubscriptionTier: {
          basic: "Требуется базовая подписка",
          premium: "Требуется премиум-подписка",
        },
        nsfw: "Этот сценарий NSFW",
        immersive: "Этот сценарий поддерживает режим визуальной новеллы",
        showInFileManager: "Показать в файловом менеджере",
        playNow: "Играть",
        update: "Обновить",
        download: "Скачать",
        about: "Описание",
        episodes: "Эпизоды",
        achievements: "Достижения",
        characters: "Персонажи",
        subscribe: "Подпишитесь, чтобы скачать",
      },
    },
  },
});
</script>

<template lang="pug">
.flex.flex-col
  RichTitle.border-b.p-3(
    :title="scenario ? translationWithFallback(scenario.name, appLocale) : 'Loading...'"
  )
    template(#icon)
      BookIcon(:size="20")
    template(#extra)
      .flex.items-center.gap-1
        .cursor-help.rounded-lg.border.border-dashed.p-1(
          v-if="requiredSubscriptionTier"
          v-tooltip="t(`scenario.requiredSubscriptionTier.${requiredSubscriptionTier}`)"
        )
          SubscriptionIcon(:size="18" :tier="requiredSubscriptionTier")

        .cursor-help.rounded-lg.border.border-dashed.p-1.text-pink-500(
          v-if="scenario?.nsfw"
          v-tooltip="t('scenario.nsfw')"
        )
          NsfwIcon.text-pink-500(:size="18")

        .cursor-help.rounded-lg.border.border-dashed.p-1(
          v-if="scenario?.immersive && env.VITE_EXPERIMENTAL_IMMERSIVE_MODE"
          v-tooltip="t('scenario.immersive')"
        )
          ImmersiveModeIcon.text-indigo-500(:size="18")

        button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
          v-if="localScenario && !localScenario?.builtin"
          @click="showInFileManager"
          v-tooltip="t('scenario.showInFileManager')"
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
        RichTitle(:title="t('scenario.episodes')")
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
        v-if="env.VITE_EXPERIMENTAL_IMMERSIVE_MODE && scenario.achievements && Object.values(scenario.achievements).length"
      )
        //- Achievements.
        RichTitle(:title="t('scenario.achievements')")
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
      RichTitle(:title="t('scenario.characters')")
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
          :required-subscription-tier
          :disk-size="remoteScenario?.downloadSize"
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
          button.btn-pressable.btn.btn-primary.btn-md.rounded-lg.shadow-lg(
            @click="$emit('newGame')"
          )
            | {{ t("scenario.playNow") }}

          button.btn-pressable.btn.btn-sm.rounded-lg.bg-white.shadow-lg(
            v-if="remoteScenario && localScenario.version < remoteScenario.version && subscriptionEnough"
            @click="beginDownload()"
          )
            | {{ t("scenario.update") }}

        template(v-else-if="remoteScenario && download !== undefined")
          button.btn-pressable.btn.btn-primary.btn-md.rounded-lg.shadow-lg(
            v-if="subscriptionEnough"
            @click="beginDownload()"
          )
            DownloadIcon(:size="20")
            span {{ t("scenario.download") }} ({{ prettyBytes(remoteScenario.downloadSize) }})

          button.btn-pressable.btn.btn-md.rounded-lg.text-white.shadow-lg(
            v-else
            :class="{ 'bg-blue-500': remoteScenario.requiredSubscriptionTier === 'basic', 'bg-purple-500': remoteScenario.requiredSubscriptionTier === 'premium' }"
            @click="onSubscribeButtonClick"
          )
            | {{ t("scenario.subscribe") }}
            ExternalLinkIcon(:size="16")
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
