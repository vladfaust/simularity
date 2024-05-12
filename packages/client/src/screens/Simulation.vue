<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { type Scenario } from "@/lib/types";
import { DefaultScene } from "../lib/simulation/phaser/defaultScene";
import Console from "./Simulation/Console.vue";
import { splitCode, zip } from "@/lib/utils";
import { buildWriterPrompt } from "@/lib/ai/writer";
import { buildDirectorPrompt, buildGnbf } from "@/lib/ai/director";
import { Game } from "../lib/simulation/phaser/game";
import { d } from "@/lib/drizzle";
import { asc, desc, eq, sql } from "drizzle-orm";
import { Stage, type StageDto } from "@/lib/simulation/stage";
import { director, writer, Gpt } from "@/lib/ai";

const { simulationId } = defineProps<{ simulationId: string }>();

let gameInstance: Game;
let stage: Stage;
let scene: DefaultScene;
const storyUpdates = ref<
  (typeof d.storyUpdates.$inferSelect & {
    codeUpdates: (typeof d.codeUpdates.$inferSelect & {})[];
  })[]
>([]);

let scenario = ref<Scenario | undefined>();

const busy = ref(false);

/**
 * The runtime simulation state object.
 */
const state = ref<{
  currentEpisode: (Scenario["episodes"][0] & { nextChunkIndex: number }) | null;
}>({ currentEpisode: null });

const storyUpdateText = ref("");
const stageUpdateCode = ref("");

const consoleModal = ref(false);
const currentEpisodeConsoleObject = computed(() =>
  state.value.currentEpisode
    ? {
        id: state.value.currentEpisode.id,
        chunks: {
          current: state.value.currentEpisode.nextChunkIndex - 1,
          total: state.value.currentEpisode.chunks.length,
        },
      }
    : null,
);

function consoleEventListener(event: KeyboardEvent) {
  // Detect tilda key press on different keyboard layouts.
  if (["~", "§", "`", ">", "]"].includes(event.key)) {
    consoleModal.value = !consoleModal.value;
    event.preventDefault();
  }
}

async function advance() {
  // 1. Advance the scenario.
  //

  let storyUpdateEpisodeId: string | null = null;
  let storyUpdateEpisodeChunkIndex: number | null = null;

  if (state.value.currentEpisode) {
    console.debug("Advancing episode", state.value.currentEpisode);

    const currentEpisode = state.value.currentEpisode;
    storyUpdateEpisodeId = currentEpisode.id;
    storyUpdateEpisodeChunkIndex = currentEpisode.nextChunkIndex;

    // Advance the episode.
    //

    storyUpdateText.value =
      currentEpisode.chunks[currentEpisode.nextChunkIndex].storyText;

    stageUpdateCode.value = "";
    for (const line of splitCode(
      currentEpisode.chunks[currentEpisode.nextChunkIndex].stageCode,
    )) {
      console.debug("Evaluating stage code", line);
      await stage.eval(line);
      stageUpdateCode.value += line + "\n";
      if (scene.busy) await scene.busy;
    }

    if (++currentEpisode.nextChunkIndex >= currentEpisode.chunks.length) {
      state.value.currentEpisode = null;
    }
  } else {
    // Predict the next update.
    //

    const writerResponse = await writer.infer(128, { stopSequences: ["\n"] });
    console.log("Writer response", writerResponse);

    const grammar = buildGnbf(scenario.value!);
    console.log("Director grammar", grammar);

    // Append the writer response to the director prompt to generate code for.
    const directorResponse = await director.inferPrompt(
      `${writerResponse}\n`,
      128,
      {
        stopSequences: ["\n"],
        grammar,
        temp: 0,
      },
    );
    console.log("Director response", directorResponse);

    storyUpdateText.value = writerResponse;
    for (const line of splitCode(directorResponse)) {
      await stage.eval(line);
      stageUpdateCode.value += line + "\n";
      if (scene.busy) await scene.busy;
    }
  }

  const newWriterPrompt = `${storyUpdateText.value}\n`;
  writer.decode(newWriterPrompt).then(() => {
    console.log("Writer decoded", newWriterPrompt);
  });

  const newDirectorPrompt = `${splitCode(stageUpdateCode.value).join(";")};\n`;
  director.decode(newDirectorPrompt).then(() => {
    console.log("Director decoded", newDirectorPrompt);
  });

  const incoming = await d.db.transaction(async (tx) => {
    const storyUpdate = (
      await tx
        .insert(d.storyUpdates)
        .values({
          simulationId: simulationId,
          text: storyUpdateText.value,
          episodeId: storyUpdateEpisodeId,
          episodeChunkIndex: storyUpdateEpisodeChunkIndex,
        })
        .returning()
    )[0];

    const codeUpdate = (
      await tx
        .insert(d.codeUpdates)
        .values({
          storyUpdateId: storyUpdate.id,
          code: splitCode(stageUpdateCode.value).join(";") + ";",
        })
        .returning()
    )[0];

    await tx
      .update(d.simulations)
      .set({ updatedAt: new Date().valueOf().toString() })
      .where(eq(d.simulations.id, simulationId));

    return { scriptUpdate: storyUpdate, codeUpdate };
  });

  storyUpdates.value.push({
    ...incoming.scriptUpdate,
    codeUpdates: [{ ...incoming.codeUpdate }],
  });
}

onMounted(async () => {
  const simulation = await d.db.query.simulations.findFirst({
    where: eq(d.simulations.id, simulationId),
  });

  if (!simulation) {
    throw new Error(`Simulation not found: ${simulationId}`);
  } else {
    console.log("Queried simulation", simulation);
  }

  scenario.value = await fetch(
    `/scenarios/${simulation.scenarioId}/manifest.json`,
  ).then((response) => response.json());
  if (!scenario.value) {
    throw new Error(`Scenario not found: ${simulation.scenarioId}`);
  } else {
    console.log("Fetched scenario", scenario.value);
  }

  // TODO: Fetch until `simulation.latestSnapshotId`.
  storyUpdates.value = await d.db.query.storyUpdates.findMany({
    where: eq(d.storyUpdates.simulationId, simulationId),
    with: {
      codeUpdates: {
        orderBy: desc(d.codeUpdates.createdAt),
        limit: 1,
      },
    },
    orderBy: asc(d.storyUpdates.createdAt),

    // ADHOC: See https://github.com/tdwesten/tauri-drizzle-sqlite-proxy-demo/issues/1.
    extras: {
      adhoc: sql`'["codeUpdates"]'`.as("_rel"),
    },
  });

  // TODO: Get initial stage value from the latest snapshot.
  stage = new Stage(scenario.value, undefined);
  await stage.init();
  let initialStage: StageDto | undefined;

  if (storyUpdates.value.length) {
    // Apply existing code updates to the stage.
    for (const update of storyUpdates.value) {
      const codeUpdate = update.codeUpdates.at(0);
      if (!codeUpdate) continue;
      await stage.eval(codeUpdate.code);
    }

    initialStage = stage.dump();

    // If the last update has an episode ID, resume from there.
    const latestStoryUpdate = storyUpdates.value.at(-1);
    if (latestStoryUpdate?.episodeId) {
      const episode = scenario.value.episodes.find(
        (e) => e.id === latestStoryUpdate.episodeId,
      );

      if (!episode) {
        throw new Error(`Episode not found: ${latestStoryUpdate.episodeId}`);
      }

      if (latestStoryUpdate.episodeChunkIndex! < episode.chunks.length - 1) {
        state.value.currentEpisode = {
          ...episode,
          nextChunkIndex: latestStoryUpdate.episodeChunkIndex! + 1,
        };
      }
    }
  }

  gameInstance = new Game();
  scene = await gameInstance.createDefaultScene(
    scenario.value,
    "/scenarios/" + simulation.scenarioId,
    initialStage,
  );

  // Connect the stage to the scene.
  stage.connectScene(scene);

  // Decode pre-prompts.
  //

  const textHistory = storyUpdates.value.map((u) => u.text);
  const codeHistory = storyUpdates.value.map((u) =>
    splitCode(u.codeUpdates.at(0)?.code || ""),
  );

  writer.clear().then(async () => {
    const writerPrePrompt =
      buildWriterPrompt(scenario.value!, textHistory) + "\n";
    console.log("Writer pre-prompt", writerPrePrompt);

    await writer.decode(writerPrePrompt);
    console.log("Writer pre-prompt decoded");
  });

  director.clear().then(async () => {
    const directorPrePrompt =
      buildDirectorPrompt(
        scenario.value!,
        zip(textHistory, codeHistory).map(([text, code]) => ({
          code: code.join(";") + ";",
          text,
        })),
      ) + "\n";
    console.log("Director pre-prompt", directorPrePrompt);

    await director.decode(directorPrePrompt);
    console.log("Director pre-prompt decoded");
  });

  // Register a console event listener.
  window.addEventListener("keypress", consoleEventListener);

  storyUpdateText.value = storyUpdates.value.at(-1)?.text || "";
  stageUpdateCode.value = splitCode(
    storyUpdates.value.at(-1)?.codeUpdates.at(0)?.code || "",
  ).join("\n");
});

onUnmounted(() => {
  window.removeEventListener("keypress", consoleEventListener);
});

function gptStatus(gpt: Gpt) {
  return computed(() => {
    if (gpt.initialized) {
      if (gpt.currentJob.value) {
        return gpt.currentJob.value.name;
      } else {
        return "Ready";
      }
    } else {
      return "Loading";
    }
  });
}

const writerStatus = gptStatus(writer);
const directorStatus = gptStatus(director);
</script>

<template lang="pug">
.relative.h-screen.w-screen.bg-red-400
  #game-screen
  .absolute.top-0.flex.w-full.justify-between.bg-white.bg-opacity-50.p-1
    span {{ scenario?.name }}: {{ simulationId }}
    .flex.gap-2
      span W: {{ writerStatus }} ({{ writer.jobs.value.length + (writer.currentJob.value ? 1 : 0) }})
      span D: {{ directorStatus }} ({{ director.jobs.value.length + (director.currentJob.value ? 1 : 0) }})
  .absolute.bottom-0.flex.h-32.w-full.flex-col.bg-yellow-500.bg-opacity-90.p-3
    p.grow {{ storyUpdateText }}
    .flex.justify-end
      button.rounded.border.px-3.py-2.pressable(
        @click="advance"
        :disabled="busy"
      ) Next

  Console(
    :open="consoleModal"
    :scene-code="stageUpdateCode"
    :scene-text="storyUpdateText"
    :episode="currentEpisodeConsoleObject"
    @close="consoleModal = false"
  )
</template>
