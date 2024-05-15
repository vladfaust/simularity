<script setup lang="ts">
import { computed, markRaw, onMounted, onUnmounted, ref } from "vue";
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
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import {
  BaseDirectory,
  createDir,
  exists,
  writeBinaryFile,
} from "@tauri-apps/api/fs";
import prettyBytes from "pretty-bytes";
import { Gpt } from "@/lib/ai";
import { GPT_DIRECTOR, GPT_WRITER } from "@/env";

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
const preLatestStoryUpdate = computed(() => storyUpdates.value.at(-2));
let previousStageState: StageState | undefined;

let scenario = ref<Scenario | undefined>();

const busy = ref(false);
const canPossiblyRegenerateStoryUpdate = computed(() =>
  latestStoryUpdate.value
    ? !latestStoryUpdate.value.episodeId &&
      !latestStoryUpdate.value.createdByPlayer
    : false,
);
const canPossiblyRegenerateCodeUpdate = computed(() =>
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

const writer = ref<Gpt | undefined>();
const deferredWriter = new Deferred<Gpt>();
const writerPrompt = ref("");
const uncommitedWriterPrompt = ref("");
const uncommitedStoryUpdateId = ref<string | undefined>();

const director = ref<Gpt | undefined>();
const deferredDirector = new Deferred<Gpt>();
const directorPrompt = ref("");
const uncommittedDirectorPrompt = ref("");
const uncommitedCodeUpdateId = ref<string | undefined>();

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

  const directorResponse = await deferredDirector.promise.then((director) =>
    director.infer(`${writerResponse}\n`, 128, {
      stopSequences: ["\n"],
      grammar,
      temp: 1,
    }),
  );
  console.log("Director response", directorResponse);
  uncommittedDirectorPrompt.value += `${directorResponse}\n`;

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
  const writerResponse = await deferredWriter.promise.then((writer) =>
    writer.infer(undefined, 128, {
      stopSequences: ["\n"],
    }),
  );
  console.log("Writer response", writerResponse);
  uncommitedWriterPrompt.value = writerResponse + "\n";

  uncommittedDirectorPrompt.value = writerResponse + "\n";
  const directorResponse = await inferCodeUpdate(writerResponse);

  return {
    writerResponse,
    directorResponse,
  };
}

/**
 * Commit the caches generated by latest inference.
 * If not committed, pending caches will be discarded
 * upon the next inference /decoding.
 *
 * Also save the stage state to be able to reset it later.
 */
async function commitLatestInference() {
  const promises = [];

  if (uncommitedStoryUpdateId.value) {
    const newKvCacheKey = `${simulationId}:${uncommitedStoryUpdateId.value}`;

    promises.push(
      deferredWriter.promise.then((writer) =>
        writer.commit(newKvCacheKey).then((tokens) => {
          console.debug("Committed to writer", newKvCacheKey, tokens);
          writerPrompt.value += uncommitedWriterPrompt.value;
          uncommitedWriterPrompt.value = "";
          uncommitedStoryUpdateId.value = undefined;
        }),
      ),
    );
  }

  if (uncommitedCodeUpdateId.value) {
    const newKvCacheKey = `${simulationId}:${uncommitedCodeUpdateId.value}`;

    promises.push(
      deferredDirector.promise.then((director) =>
        director.commit(newKvCacheKey).then((tokens) => {
          console.debug("Committed to director", newKvCacheKey, tokens);
          directorPrompt.value += uncommittedDirectorPrompt.value;
          uncommittedDirectorPrompt.value = "";
          uncommitedCodeUpdateId.value = undefined;
        }),
      ),
    );
  }

  await Promise.all(promises);

  previousStageState = stage.dump();
  console.debug("Saved stage state", previousStageState);
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
    uncommittedDirectorPrompt.value = "";
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

    // Use the same parent update ID as the pre-latest update.
    let parentUpdateId = preLatestStoryUpdate.value?.id;
    storyUpdateText.value = preLatestStoryUpdate.value?.text || "";

    const { writerResponse, directorResponse } = await inferStoryUpdate();

    storyUpdateText.value = writerResponse;
    stageUpdateCode.value = directorResponse;

    const incoming = await saveUpdatesToDb({
      storyUpdate: {
        parentUpdateId,
        text: writerResponse,
      },
      codeUpdate: {
        code: directorResponse,
      },
    });

    uncommitedStoryUpdateId.value = incoming.storyUpdate.id;
    uncommitedCodeUpdateId.value = incoming.codeUpdate.id;

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
 * Send player's input to the simulation.
 * Will predict director update for the input.
 * Input may be edited later, therefore
 * is not committed to GPT yet.
 */
async function sendPlayerInput() {
  if (state.value.currentEpisode) {
    throw new Error("Player input not allowed during episode");
  }

  let playerInput_ = playerInput.value;
  if (!playerInput_) {
    throw new Error("Empty player input");
  }

  playerInput.value = "";
  let wouldRestorePlayerInput = true;

  busy.value = true;
  try {
    storyUpdateText.value = playerInput_;
    await commitLatestInference();

    uncommitedWriterPrompt.value = `${playerInput_}\n`;
    uncommittedDirectorPrompt.value = `${playerInput_}\n`;

    const directorResponse = await inferCodeUpdate(`${playerInput_}\n`);
    uncommittedDirectorPrompt.value += `${directorResponse}\n`;

    const incoming = await saveUpdatesToDb({
      storyUpdate: {
        parentUpdateId: latestStoryUpdate.value?.id,
        text: playerInput_,
        createdByPlayer: true,
      },
      codeUpdate: {
        code: directorResponse,
      },
    });

    uncommitedStoryUpdateId.value = incoming.storyUpdate.id;
    uncommitedCodeUpdateId.value = incoming.codeUpdate.id;

    storyUpdates.value.push({
      ...incoming.storyUpdate,
      codeUpdates: [incoming.codeUpdate],
    });
  } catch (e) {
    if (wouldRestorePlayerInput) {
      playerInput.value = playerInput_;
    }

    storyUpdateText.value = latestStoryUpdate.value?.text || "";

    throw e;
  } finally {
    busy.value = false;
  }
}

/**
 * Move the story forward by either applying an episode update,
 * or by predicting the next update from the latent space.
 */
async function advance() {
  if (playerInput.value) {
    throw new Error("To advance, player input must be empty");
  }

  // Advance the story.
  //

  let storyUpdateEpisodeId: string | null = null;
  let storyUpdateEpisodeChunkIndex: number | null = null;

  busy.value = true;
  try {
    await commitLatestInference();

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

      const incoming = await saveUpdatesToDb({
        storyUpdate: {
          parentUpdateId: latestStoryUpdate.value?.id,
          text: storyUpdateText.value,
          episodeId: storyUpdateEpisodeId,
          episodeChunkIndex: storyUpdateEpisodeChunkIndex,
        },
        codeUpdate: {
          code: stageUpdateCode.value,
        },
      });

      storyUpdates.value.push({
        ...incoming.storyUpdate,
        codeUpdates: [{ ...incoming.codeUpdate }],
      });

      const newWriterPrompt = `${storyUpdateText.value}\n`;
      writerPrompt.value += newWriterPrompt;
      deferredWriter.promise.then((writer) =>
        writer.decode(
          newWriterPrompt,
          `${simulationId}:${incoming.storyUpdate.id}`,
        ),
      );

      const newDirectorPrompt = `${storyUpdateText.value}\n${stageUpdateCode.value};\n`;
      directorPrompt.value += newDirectorPrompt;
      deferredDirector.promise.then((director) =>
        director.decode(
          newDirectorPrompt,
          `${simulationId}:${incoming.codeUpdate.id}`,
        ),
      );
    } else {
      // Predict the next update.
      // Do not commit it to GPT yet.
      //

      const { writerResponse, directorResponse } = await inferStoryUpdate();

      storyUpdateText.value = writerResponse;
      stageUpdateCode.value = directorResponse;

      const incoming = await saveUpdatesToDb({
        storyUpdate: {
          parentUpdateId: latestStoryUpdate.value?.id,
          text: writerResponse,
        },
        codeUpdate: {
          code: directorResponse,
        },
      });

      uncommitedStoryUpdateId.value = incoming.storyUpdate.id;
      uncommitedCodeUpdateId.value = incoming.codeUpdate.id;

      storyUpdates.value.push({
        ...incoming.storyUpdate,
        codeUpdates: [{ ...incoming.codeUpdate }],
      });
    }

    screenshot(true).then((shot) => {
      if (shot) {
        console.log("Saved screenshot", shot.path, prettyBytes(shot.size));
      }
    });
  } finally {
    busy.value = false;
  }
}

/**
 * Take a screenshot of the game, and save it at
 * `$APPLOCALDATA/screenshots/{simulationId}`.
 */
async function screenshot(
  rewrite: boolean,
): Promise<{ path: string; size: number } | null> {
  const path = await join(
    await appLocalDataDir(),
    "screenshots",
    `${simulationId}.jpg`,
  );

  if ((await exists(path)) && !rewrite) {
    return null;
  }

  const dataUri = gameInstance.screenshot("image/jpeg");
  const base64 = dataUri.split(",")[1];
  const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  await createDir("screenshots", {
    dir: BaseDirectory.AppLocalData,
    recursive: true,
  });
  await writeBinaryFile(path, buffer, { append: false });

  return { path, size: buffer.length };
}

/**
 * Save updates to the database.
 */
async function saveUpdatesToDb(updates: {
  storyUpdate: {
    parentUpdateId: string | undefined | null;
    text: string;
  } & (
    | {
        episodeId: string;
        episodeChunkIndex: number;
      }
    | {
        createdByPlayer: true;
      }
    | {}
  );
  codeUpdate: {
    code: string;
  };
}) {
  return d.db.transaction(async (tx) => {
    const storyUpdate = (
      await tx
        .insert(d.storyUpdates)
        .values({
          simulationId,
          ...updates.storyUpdate,
        })
        .returning()
    )[0];

    const codeUpdate = (
      await tx
        .insert(d.codeUpdates)
        .values({
          storyUpdateId: storyUpdate.id,
          ...updates.codeUpdate,
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

/**
 * Prepare the GPTs for the simulation.
 */
async function prepareGpts() {
  // When starting a simulation, find a GPT instance by parameters.
  // Its KV cache key is `simulationId:updateId`.
  // If full match, continue as-is.
  // If `updateId` is in the same branch as the current update,
  // continue the decoding from that `updateId`.
  // If the cache key is not empty, call `gptReset` and do full decode.
  // If it's empty, do full decode.
  // Upon decoding or committing, update KV cache key with recent `updateId`.
  //

  // Decode pre-prompts.
  // Would not include the latest update if it can be regenerated.
  //

  const committedStoryUpdates = storyUpdates.value.slice(0, -1);
  const committedCodeUpdates = committedStoryUpdates.map(
    (u) => u.codeUpdates.at(0)!,
  );

  const latestUpdate = storyUpdates.value.at(-1);
  if (latestUpdate) {
    if (latestUpdate.episodeId) {
      committedStoryUpdates.push(latestUpdate);
      committedCodeUpdates.push(latestUpdate.codeUpdates.at(0)!);
    } else {
      // NOTE: Player-created updates are also considered uncommitted.
      uncommitedWriterPrompt.value = `${latestUpdate.text}\n`;
      uncommittedDirectorPrompt.value = `${latestUpdate.text}\n${latestUpdate.codeUpdates.at(0)!.code};\n`;
    }
  }

  const textHistory = committedStoryUpdates.map((u) => u.text);
  const codeHistory = committedCodeUpdates.map((u) => u?.code);

  const writerFullPromptBuilder = () =>
    buildWriterPrompt(scenario.value!, textHistory) + "\n";

  const directorFullPromptBuilder = () =>
    buildDirectorPrompt(
      scenario.value!,
      zip(textHistory, codeHistory).map(([text, code]) => ({ text, code })),
    ) + "\n";

  writerPrompt.value += writerFullPromptBuilder();
  directorPrompt.value += directorFullPromptBuilder();

  const writerPartialPromptBuilder = (from: number, to: number) =>
    textHistory.slice(from, to).join("\n") + "\n";

  const directorPartialPromptBuilder = (from: number, to: number) =>
    zip(textHistory.slice(from, to), codeHistory.slice(from, to))
      .map(([text, code]) => `${text}\n${code}`)
      .join("\n") + "\n";

  async function syncGptCache(
    gpt: Gpt,
    kvCacheKey: string,
    committedUpdates: { id: string }[],
    fullPromptBuilder: () => string,
    partialPromptBuilder: (
      fromCommittedUpdateIndex: number,
      toCommittedUpdateIndex: number,
    ) => string,
  ) {
    const headUpdateId = committedUpdates.at(-1)?.id;
    const headKvCacheKey = `${simulationId}:${headUpdateId}`;

    if (kvCacheKey) {
      console.debug(`${gpt.id} kvCacheKey: ${kvCacheKey}.`);
      const [kvCacheKeySimulationId, kvCacheKeyUpdateId] =
        kvCacheKey.split(":");

      if (!headUpdateId) {
        console.debug(`${gpt.id}: kvCacheKey not empty, but no head; reset…`);
        await gpt.reset();
      } else if (kvCacheKeySimulationId !== simulationId) {
        console.debug(`${gpt.id}: kvCacheKey simulation ID mismatch, rebuild…`);
        await gpt.reset();
        await gpt.decode(fullPromptBuilder(), headKvCacheKey);
      } else if (kvCacheKeyUpdateId !== headUpdateId) {
        // Try finding the cached update in the list of committed updates.
        // If found, continue decoding from there.
        // If not found, reset the model.
        //

        const cachedUpdateIndex = committedUpdates.findIndex(
          (u) => u?.id === kvCacheKeyUpdateId,
        );

        if (cachedUpdateIndex !== -1) {
          console.log(
            `${gpt.id}: kvCacheKey partial update ID mismatch, decoding from update ID ${kvCacheKeyUpdateId} to ${headUpdateId} (${committedUpdates.length - cachedUpdateIndex} updates)…`,
          );

          await gpt.decode(
            partialPromptBuilder(cachedUpdateIndex, committedUpdates.length),
            headKvCacheKey,
          );
        } else {
          console.log(
            `${gpt.id}: kvCacheKey complete update ID mismatch, full rebuild…`,
          );

          await gpt.reset();
          await gpt.decode(fullPromptBuilder(), headKvCacheKey);
        }
      } else {
        console.log(`${gpt.id}: kvCacheKey full match, do nothing.`);
      }
    } else if (headUpdateId) {
      console.log(`${gpt.id}: empty kvCacheKey, full cache rebuild…`);
      await gpt.decode(fullPromptBuilder(), headKvCacheKey);
    } else {
      console.log(`${gpt.id}: empty kvCacheKey, no head; do nothing.`);
    }

    console.log(`${gpt.id} KV cache synchronized.`);
    return gpt;
  }

  const promises = [];

  promises.push(
    Gpt.findOrCreate(
      "writer",
      GPT_WRITER.modelPath,
      GPT_WRITER.contextSize,
      GPT_WRITER.batchSize,
    )
      .then(({ gpt, kvCacheKey }) => {
        writer.value = markRaw(gpt);

        return syncGptCache(
          gpt,
          kvCacheKey,
          committedStoryUpdates,
          writerFullPromptBuilder,
          writerPartialPromptBuilder,
        );
      })
      .then((gpt) => {
        deferredWriter.resolve(gpt);
      }),
  );

  promises.push(
    Gpt.findOrCreate(
      "director",
      GPT_DIRECTOR.modelPath,
      GPT_DIRECTOR.contextSize,
      GPT_DIRECTOR.batchSize,
    )
      .then(({ gpt, kvCacheKey }) => {
        director.value = markRaw(gpt);

        return syncGptCache(
          gpt,
          kvCacheKey,
          committedCodeUpdates,
          directorFullPromptBuilder,
          directorPartialPromptBuilder,
        );
      })
      .then((gpt) => {
        deferredDirector.resolve(gpt);
      }),
  );

  await Promise.all(promises);
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
  //

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
  await stage.initCodeEngine();

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

  // Register a console event listener.
  window.addEventListener("keypress", consoleEventListener);

  storyUpdateText.value = storyUpdates.value.at(-1)?.text || "";
  stageUpdateCode.value = splitCode(
    storyUpdates.value.at(-1)?.codeUpdates.at(0)?.code || "",
  ).join("\n");

  // ADHOC: Always create a screenshot upon running a simulation,
  // because there is currently no easy way to detect
  // if there have been any real updates.
  screenshot(false).then((shot) => {
    if (shot) {
      console.log("Saved screenshot", shot.path, prettyBytes(shot.size));
    }
  });

  await prepareGpts();
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
          :disabled="busy || !canPossiblyRegenerateStoryUpdate"
          class="disabled:cursor-not-allowed disabled:opacity-50"
        )
          RefreshCwIcon(:size="20")
        button.btn.pressable(
          @click="regenerateCode"
          :disabled="busy || !canPossiblyRegenerateCodeUpdate"
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
        @click="playerInput ? sendPlayerInput() : advance()"
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
    :writer="writer"
    :writer-prompt="writerPrompt"
    :uncommited-writer-prompt="uncommitedWriterPrompt"
    :director="director"
    :director-prompt="directorPrompt"
    :uncommited-director-prompt="uncommittedDirectorPrompt"
    :scene-code="stageUpdateCode"
    :scene-text="storyUpdateText"
    :episode="currentEpisodeConsoleObject"
    @close="consoleModal = false"
  )
</template>
