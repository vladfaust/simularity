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

const writerPrompt = ref("");
const directorPrompt = ref("");

const consoleModal = ref(false);
// FIXME: Proper episode display.
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

const playerInput = ref("");
const playerInputEnabled = computed(
  () => !busy.value && !state.value.currentEpisode,
);

function consoleEventListener(event: KeyboardEvent) {
  // Detect tilda key press on different keyboard layouts.
  if (["~", "§", "`", ">", "]"].includes(event.key)) {
    consoleModal.value = !consoleModal.value;
    event.preventDefault();
  }
}

async function advance() {
  // Advance the story.
  //

  let storyUpdateEpisodeId: string | null = null;
  let storyUpdateEpisodeChunkIndex: number | null = null;

  let playerInput_ = playerInput.value;
  playerInput.value = "";
  let wouldRestorePlayerInput = true;

  busy.value = true;
  try {
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

      const newWriterPrompt = `${storyUpdateText.value}\n`;
      writerPrompt.value += newWriterPrompt;
      writer.decode(newWriterPrompt);

      const newDirectorPrompt = `${storyUpdateText.value}\n${splitCode(stageUpdateCode.value).join(";")};\n`;
      directorPrompt.value += newDirectorPrompt;
      director.decode(newDirectorPrompt);
    } else {
      if (playerInput_) {
        // If the player input is not empty, display & decode it.
        //

        storyUpdateText.value = playerInput_;
        writerPrompt.value += playerInput_ + "\n";
        directorPrompt.value += playerInput_ + "\n";
        writer.decode(playerInput_ + "\n");
        director.decode(playerInput_ + "\n");
      }

      // Predict the next update.
      //

      const writerResponse = await writer.infer(128, { stopSequences: ["\n"] });
      console.log("Writer response", writerResponse);
      writerPrompt.value += writerResponse + "\n";
      writer.decode(writerResponse + "\n");

      const grammar = buildGnbf(scenario.value!);
      console.log("Director grammar", grammar);
      // Append the writer response to the director prompt to generate code for.
      directorPrompt.value += `${writerResponse}\n`;
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
      directorPrompt.value += directorResponse + "\n";
      director.decode(directorResponse + "\n");

      storyUpdateText.value = writerResponse;
      stageUpdateCode.value = "";
      for (const line of splitCode(directorResponse)) {
        console.debug("Evaluating stage code", line);
        await stage.eval(line);
        stageUpdateCode.value += line + "\n";
        if (scene.busy) await scene.busy;
      }
    }

    // Save updates to DB.
    //

    const incoming = await d.db.transaction(async (tx) => {
      if (playerInput_) {
        await tx.insert(d.storyUpdates).values({
          simulationId: simulationId,
          createdByPlayer: true,
          text: storyUpdateText.value,
        });
      }

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

      // TODO: `scriptUpdate` -> `storyUpdate`.
      return { scriptUpdate: storyUpdate, codeUpdate };
    });

    storyUpdates.value.push({
      ...incoming.scriptUpdate,
      codeUpdates: [{ ...incoming.codeUpdate }],
    });
  } catch (e) {
    if (wouldRestorePlayerInput) {
      playerInput.value = playerInput_;
    }
  } finally {
    busy.value = false;
  }
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
  const codeHistory = storyUpdates.value.map((u) => {
    const codeUpdate = u.codeUpdates.at(0);
    if (codeUpdate) return splitCode(codeUpdate.code);
    else return undefined;
  });

  writer.clear().then(async () => {
    const writerPrePrompt =
      buildWriterPrompt(scenario.value!, textHistory) + "\n";
    console.log("Writer pre-prompt", writerPrePrompt);
    writerPrompt.value += writerPrePrompt;

    await writer.decode(writerPrePrompt);
    console.log("Writer pre-prompt decoded");
  });

  director.clear().then(async () => {
    const directorPrePrompt =
      buildDirectorPrompt(
        scenario.value!,
        zip(textHistory, codeHistory).map(([text, code]) => ({
          code: code ? code.join(";") + ";" : undefined,
          text,
        })),
      ) + "\n";
    console.log("Director pre-prompt", directorPrePrompt);
    directorPrompt.value += directorPrePrompt;

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

  .absolute.bottom-0.flex.h-32.w-full.flex-col.overflow-hidden.bg-yellow-500.bg-opacity-90.p-3
    .grow.overflow-scroll
      p(:class="{ 'animate-pulse': busy }") {{ storyUpdateText }}

    .flex.w-full.gap-2
      input.w-full.rounded.px-2(
        v-model="playerInput"
        placeholder="Player input"
        :disabled="!playerInputEnabled"
        class="disabled:opacity-50"
      )
      button.rounded.border.px-3.py-2.pressable(
        @click="advance"
        :disabled="busy"
        class="disabled:cursor-not-allowed disabled:opacity-50"
      ) {{ playerInput ? "Send" : "Next" }}

  Console(
    :open="consoleModal"
    :writer-prompt="writerPrompt"
    :director-prompt="directorPrompt"
    :scene-code="stageUpdateCode"
    :scene-text="storyUpdateText"
    :episode="currentEpisodeConsoleObject"
    @close="consoleModal = false"
  )
</template>
