<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { type Scenario } from "@/lib/types";
import { DefaultScene } from "../lib/simulation/phaser/defaultScene";
import Console from "./Simulation/Console.vue";
import { Deferred, sleep, splitCode, zip } from "@/lib/utils";
import { buildWriterPrompt } from "@/lib/ai/writer";
import { buildDirectorPrompt, buildGnbf } from "@/lib/ai/director";
import { Game } from "../lib/simulation/phaser/game";
import { d, sqlite, parseSelectResult } from "@/lib/drizzle";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { Stage, type State as StageState } from "@/lib/simulation/stage";
import { director, writer } from "@/lib/ai";
import GptStatus from "./Simulation/GptStatus.vue";
import {
  BinaryIcon,
  ClapperboardIcon,
  RefreshCwIcon,
  ScrollTextIcon,
} from "lucide-vue-next";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { storyUpdatesTableName } from "@/lib/drizzle/schema/storyUpdates.ts";
import { TransitionRoot } from "@headlessui/vue";

const { simulationId } = defineProps<{ simulationId: string }>();

let gameInstance: Game;
let stage: Stage;
let scene: DefaultScene;
const storyUpdates = ref<
  (typeof d.storyUpdates.$inferSelect & {
    codeUpdates: (typeof d.codeUpdates.$inferSelect & {})[];
  })[]
>([]);
const latestStoryUpdate = computed(() => storyUpdates.value.at(-1));
let previousStageState: StageState | undefined;

let scenario = ref<Scenario | undefined>();

const busy = ref(false);
const canPossiblyRegenerate = computed(() =>
  latestStoryUpdate.value ? !latestStoryUpdate.value.episodeId : false,
);

/**
 * The runtime simulation state object.
 */
const state = ref<{
  currentEpisode: (Scenario["episodes"][0] & { nextChunkIndex: number }) | null;
}>({ currentEpisode: null });

const storyUpdateText = ref("");
const stageUpdateCode = ref("");

const writerPrompt = ref("");
const uncommitedWriterPrompt = ref("");
const directorPrompt = ref("");
const uncommitedDirectorPrompt = ref("");

const fullFade = ref(false);
let fadeDeferred: Deferred<void> | undefined;
function onAfterFullFade() {
  fadeDeferred?.resolve();
}

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

/**
 * Predict the next director update for writer response.
 */
async function inferCodeUpdate(writerResponse: string): Promise<string> {
  const grammar = buildGnbf(scenario.value!);
  console.debug("Director grammar", grammar);

  const directorResponse = await director.infer(`${writerResponse}\n`, 128, {
    stopSequences: ["\n"],
    grammar,
    temp: 1,
  });
  console.log("Director response", directorResponse);
  uncommitedDirectorPrompt.value = `${writerResponse}\n${directorResponse}\n`;

  for (const line of splitCode(directorResponse)) {
    console.debug("Evaluating stage code", line);
    await stage.eval(line);
    if (scene.busy) await scene.busy;
  }

  return directorResponse;
}

/**
 * Predict the next writer and director updates.
 */
async function inferStoryUpdate(): Promise<{
  writerResponse: string;
  directorResponse: string;
}> {
  const writerResponse: string = await writer.infer(undefined, 128, {
    stopSequences: ["\n"],
  });
  console.log("Writer response", writerResponse);
  uncommitedWriterPrompt.value = writerResponse + "\n";

  const directorResponse = await inferCodeUpdate(writerResponse);

  return {
    writerResponse,
    directorResponse,
  };
}

/**
 * Commit the latest inference to the story.
 */
async function acceptLatestInference() {
  const promises = [];

  if (uncommitedWriterPrompt.value) {
    promises.push(
      writer.commit().then((tokens) => {
        console.debug("Committed writer", tokens);
        writerPrompt.value += uncommitedWriterPrompt.value;
        uncommitedWriterPrompt.value = "";
      }),
    );
  }

  if (uncommitedDirectorPrompt.value) {
    promises.push(
      director.commit().then((tokens) => {
        console.debug("Committed director", tokens);
        directorPrompt.value += uncommitedDirectorPrompt.value;
        uncommitedDirectorPrompt.value = "";
      }),
    );
  }

  previousStageState = stage.dump();
  console.debug("Saved stage state", previousStageState);

  return Promise.all(promises);
}

async function resetStage() {
  fadeDeferred = new Deferred();
  fullFade.value = true;
  return fadeDeferred.promise.then(async () => {
    console.log("Resetting stage");
    stage.set(previousStageState);
    console.debug("Loaded stage state", previousStageState);
    await sleep(50);
    fullFade.value = false;
  });
}

/**
 * Explicitly regenerate the code update for existing story update.
 */
async function regenerateCode() {
  if (!latestStoryUpdate.value) {
    throw new Error("regenerateCode() requires a story update");
  }

  busy.value = true;
  try {
    // OPTIMIZE: Infer while waiting for the fade.
    await resetStage();
    storyUpdateText.value = latestStoryUpdate.value.text;

    const writerResponse = latestStoryUpdate.value.text;
    const directorResponse = await inferCodeUpdate(writerResponse);

    stageUpdateCode.value = directorResponse;

    const codeUpdate = (
      await d.db
        .insert(d.codeUpdates)
        .values({
          storyUpdateId: latestStoryUpdate.value.id,
          code: directorResponse,
        })
        .returning()
    )[0];

    latestStoryUpdate.value.codeUpdates.push(codeUpdate);
  } finally {
    busy.value = false;
  }
}

/**
 * Explicitly regenerate the story update along with the code update.
 */
async function regenerateStory() {
  if (!latestStoryUpdate.value) {
    throw new Error("regenerateStory() requires a story update");
  }

  busy.value = true;
  try {
    // OPTIMIZE: Infer while waiting for the fade.
    await resetStage();

    // Use the same parent update ID.
    let parentUpdateId = latestStoryUpdate.value.id;
    storyUpdateText.value = latestStoryUpdate.value.text;

    const { writerResponse, directorResponse } = await inferStoryUpdate();

    storyUpdateText.value = writerResponse;
    stageUpdateCode.value = directorResponse;

    const incoming = await saveUpdatesToDb(
      undefined,
      parentUpdateId,
      null,
      null,
      writerResponse,
      directorResponse,
    );

    storyUpdates.value.pop();
    storyUpdates.value.push({
      ...incoming.storyUpdate,
      codeUpdates: [{ ...incoming.codeUpdate }],
    });
  } finally {
    busy.value = false;
  }
}

/**
 * Move the story forward by either applying an episode update,
 * or by predicting the next update from the latent space.
 */
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
    await acceptLatestInference();

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

      previousStageState = stage.dump();
      console.debug("Saved stage state", previousStageState);

      const newWriterPrompt = `${storyUpdateText.value}\n`;
      writerPrompt.value += newWriterPrompt;
      writer.decode(newWriterPrompt);

      const newDirectorPrompt = `${storyUpdateText.value}\n${splitCode(stageUpdateCode.value).join(";")};\n`;
      directorPrompt.value += newDirectorPrompt;
      director.decode(newDirectorPrompt);
    } else {
      if (playerInput_) {
        // Display & decode the player input.
        //
        // The input can not be edited (for now):
        // it is re-used upon regeneration.
        //

        storyUpdateText.value = playerInput_;

        const newWriterPrompt = playerInput_ + "\n";
        writerPrompt.value += newWriterPrompt;
        writer.decode(newWriterPrompt);

        const newDirectorPrompt = playerInput_ + "\n";
        directorPrompt.value += newDirectorPrompt;
        director.decode(newDirectorPrompt);
      }

      // Predict the next update.
      // Do not commit it to GPT yet.
      //

      const { writerResponse, directorResponse } = await inferStoryUpdate();

      storyUpdateText.value = writerResponse;
      stageUpdateCode.value = directorResponse;
    }

    // Save updates to DB.
    //

    const incoming = await saveUpdatesToDb(
      playerInput_,
      latestStoryUpdate.value?.id,
      storyUpdateEpisodeId,
      storyUpdateEpisodeChunkIndex,
      storyUpdateText.value,
      stageUpdateCode.value,
    );

    storyUpdates.value.push({
      ...incoming.storyUpdate,
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

/**
 * Save updates to the database.
 */
async function saveUpdatesToDb(
  playerInput: string | undefined,
  parentUpdateId: string | undefined,
  storyUpdateEpisodeId: string | null,
  storyUpdateEpisodeChunkIndex: number | null,
  writerText: string,
  directorCode: string,
) {
  return d.db.transaction(async (tx) => {
    if (playerInput) {
      parentUpdateId = (
        await tx
          .insert(d.storyUpdates)
          .values({
            simulationId: simulationId,
            parentUpdateId,
            createdByPlayer: true,
            text: playerInput,
          })
          .returning({
            id: d.storyUpdates.id,
          })
      )[0].id;
    }

    const storyUpdate = (
      await tx
        .insert(d.storyUpdates)
        .values({
          simulationId,
          parentUpdateId,
          text: writerText,
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
          code: directorCode,
        })
        .returning()
    )[0];

    await tx
      .update(d.simulations)
      .set({
        headStoryUpdateId: storyUpdate.id,
        updatedAt: new Date().valueOf().toString(),
      })
      .where(eq(d.simulations.id, simulationId));

    return { storyUpdate, codeUpdate };
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
  const query = new SQLiteSyncDialect().sqlToQuery(
    sql.raw(`
      WITH
        story_updates_tree AS (
          SELECT
            ${d.storyUpdates.id.name},
            ${d.storyUpdates.parentUpdateId.name},
            ${d.storyUpdates.createdByPlayer.name},
            ${d.storyUpdates.text.name},
            ${d.storyUpdates.episodeId.name},
            ${d.storyUpdates.episodeChunkIndex.name},
            ${d.storyUpdates.llamaInferenceId.name},
            ${d.storyUpdates.createdAt.name}
          FROM
            ${storyUpdatesTableName}
          WHERE
            ${d.storyUpdates.id.name} = ?
          UNION ALL
          SELECT
            parent.${d.storyUpdates.id.name},
            parent.${d.storyUpdates.parentUpdateId.name},
            parent.${d.storyUpdates.createdByPlayer.name},
            parent.${d.storyUpdates.text.name},
            parent.${d.storyUpdates.episodeId.name},
            parent.${d.storyUpdates.episodeChunkIndex.name},
            parent.${d.storyUpdates.llamaInferenceId.name},
            parent.${d.storyUpdates.createdAt.name}
          FROM
            ${storyUpdatesTableName} parent
            JOIN story_updates_tree child ON child.${d.storyUpdates.parentUpdateId.name} = parent.${d.storyUpdates.id.name}
        )
      SELECT
        *
      FROM
        story_updates_tree;
  `),
  );

  // console.debug(query.sql);
  const result = await sqlite.query(query.sql, [simulation.headStoryUpdateId]);
  storyUpdates.value = parseSelectResult(d.storyUpdates, result)
    .map((update) => ({
      ...update,
      codeUpdates: [],
    }))
    .reverse();

  // Attach the latest code updates to the story updates.
  const codeUpdates = await d.db
    .select()
    .from(d.codeUpdates)
    .where(
      inArray(
        d.codeUpdates.storyUpdateId,
        storyUpdates.value.map((u) => u.id),
      ),
    )
    .orderBy(desc(d.codeUpdates.createdAt))
    .groupBy(d.codeUpdates.storyUpdateId)
    .all();

  for (const codeUpdate of codeUpdates) {
    const storyUpdate = storyUpdates.value.find(
      (u) => u.id === codeUpdate.storyUpdateId,
    );

    if (storyUpdate) {
      storyUpdate.codeUpdates.push(codeUpdate);
    } else {
      throw new Error(
        `For code update ${codeUpdate.id}, story update ${codeUpdate.storyUpdateId} not found`,
      );
    }
  }

  // TODO: Get initial stage value from the latest snapshot.
  stage = new Stage(scenario.value);
  await stage.init();

  if (storyUpdates.value.length) {
    // Apply existing code updates to the stage.
    let i = 0;
    for (const update of storyUpdates.value) {
      const codeUpdate = update.codeUpdates.at(0);

      if (codeUpdate) {
        console.debug("Evaluating stage code", codeUpdate.code);
        await stage.eval(codeUpdate.code);
      }

      // For the sake of regeneration,
      // save the stage state at the -2nd update.
      // But when there only one update, save -1st.
      if (
        storyUpdates.value.length == 1 ||
        i++ === storyUpdates.value.length - 2
      ) {
        previousStageState = stage.dump();
        console.debug("Saved stage state", previousStageState);
      }
    }

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
    stage.dump(),
  );

  // Connect the stage to the scene.
  stage.connectScene(scene);

  // Decode pre-prompts.
  // Would not include the latest update if it can be regenerated.
  //

  const prePromptUpdates = storyUpdates.value.slice(0, -1);
  const latestUpdate = storyUpdates.value.at(-1);
  if (latestUpdate) {
    if (latestUpdate.episodeId || latestUpdate.createdByPlayer) {
      prePromptUpdates.push(storyUpdates.value.at(-1)!);
    } else {
      uncommitedWriterPrompt.value = `${latestUpdate.text}\n`;
      uncommitedDirectorPrompt.value = `${latestUpdate.text}\n${latestUpdate.codeUpdates.at(0)?.code};\n`;
    }
  }

  const textHistory = prePromptUpdates.map((u) => u.text);
  const codeHistory = prePromptUpdates.map((u) => {
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
</script>

<template lang="pug">
.relative.h-screen.w-screen.bg-red-400
  #game-screen

  .absolute.top-0.flex.w-full.justify-between.bg-white.bg-opacity-50.p-1
    span {{ scenario?.name }}: {{ simulationId }}
    .flex.gap-2
      .flex.items-center.gap-1
        GptStatus(:gpt="writer" :icon-size="22")
          ScrollTextIcon(:size="18")
        GptStatus(:gpt="director" :icon-size="22")
          ClapperboardIcon(:size="18")

  .absolute.bottom-0.flex.h-32.w-full.flex-col.overflow-hidden.bg-yellow-500.bg-opacity-90.p-3
    .flex.grow.overflow-hidden
      .flex.grow.flex-col.overflow-y-scroll
        p(:class="{ 'animate-pulse': busy }") {{ storyUpdateText }}

      .flex.flex-col.gap-2
        button.btn.pressable(
          @click="regenerateStory"
          :disabled="busy || !canPossiblyRegenerate"
          class="disabled:cursor-not-allowed disabled:opacity-50"
        )
          RefreshCwIcon(:size="20")
        button.btn.pressable(
          @click="regenerateCode"
          :disabled="busy || !canPossiblyRegenerate"
          class="disabled:cursor-not-allowed disabled:opacity-50"
        )
          BinaryIcon(:size="20")

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

  //- Fade layer.
  TransitionRoot(
    as="template"
    :unmount="true"
    :show="fullFade"
    enter="transition-opacity duration-500 ease-in"
    enter-from="opacity-0"
    enter-to="opacity-100"
    leave="transition-opacity duration-500 ease-out"
    leave-from="opacity-100"
    leave-to="opacity-0"
    @after-enter="onAfterFullFade"
  )
    .absolute.top-0.z-40.h-screen.w-screen.bg-black

  Console(
    :open="consoleModal"
    :writer-prompt="writerPrompt"
    :uncommited-writer-prompt="uncommitedWriterPrompt"
    :director-prompt="directorPrompt"
    :uncommited-director-prompt="uncommitedDirectorPrompt"
    :scene-code="stageUpdateCode"
    :scene-text="storyUpdateText"
    :episode="currentEpisodeConsoleObject"
    @close="consoleModal = false"
  )
</template>
