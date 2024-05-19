<script setup lang="ts">
import { computed, markRaw, onMounted, onUnmounted, ref } from "vue";
import { type Scenario } from "@/lib/types";
import { DefaultScene } from "../lib/simulation/phaser/defaultScene";
import DeveloperConsole from "./Simulation/DeveloperConsole.vue";
import { Deferred, clone, sleep, splitCode, zip } from "@/lib/utils";
import { buildWriterPrompt } from "@/lib/ai/writer";
import { buildDirectorPrompt, buildGnbf } from "@/lib/ai/director";
import { Game } from "../lib/simulation/phaser/game";
import { d, sqlite, parseSelectResult } from "@/lib/drizzle";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { Stage, type StageCall, type StageState } from "@/lib/simulation/stage";
import GptStatus from "./Simulation/GptStatus.vue";
import {
  BinaryIcon,
  ClapperboardIcon,
  RefreshCwIcon,
  ScrollTextIcon,
} from "lucide-vue-next";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { writerUpdatesTableName } from "@/lib/drizzle/schema/writerUpdates";
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
import SandboxConsole from "./Simulation/SandboxConsole.vue";
import { stageCallsToLua, comparesDeltas } from "@/lib/simulation/stage";

const { simulationId } = defineProps<{ simulationId: string }>();

let gameInstance: Game;
let stage: Stage;
let scene: DefaultScene;
const writerUpdates = ref<
  (typeof d.writerUpdates.$inferSelect & {
    directorUpdates: (typeof d.directorUpdates.$inferSelect & {})[];
  })[]
>([]);
const latestWriterUpdate = computed(() => writerUpdates.value.at(-1));
const preLatestWriterUpdate = computed(() => writerUpdates.value.at(-2));

const previousStageState = ref<StageState | undefined | null>();

let scenario = ref<Scenario | undefined>();
const assetBaseUrl = ref<URL | undefined>();

const busy = ref(false);
const canPossiblyRegenerateWriterUpdate = computed(() =>
  latestWriterUpdate.value
    ? !latestWriterUpdate.value.episodeId &&
      !latestWriterUpdate.value.createdByPlayer
    : false,
);
const canPossiblyRegenerateDirectorUpdate = computed(() =>
  latestWriterUpdate.value ? !latestWriterUpdate.value.episodeId : false,
);

/**
 * The runtime simulation state object.
 */
const state = ref<{
  currentEpisode: (Scenario["episodes"][0] & { nextChunkIndex: number }) | null;
}>({ currentEpisode: null });

const latestWriterUpdateText = ref("");
const latestDirectorUpdateCode = ref<StageCall[] | null | undefined>();

const writer = ref<Gpt | undefined>();
const deferredWriter = new Deferred<Gpt>();
const writerPrompt = ref("");
const uncommitedWriterPrompt = ref("");
const uncommitedWriterUpdateId = ref<string | undefined>();

const enableDirector = ref(false);
const director = ref<Gpt | undefined>();
const deferredDirector = new Deferred<Gpt>();
const directorPrompt = ref("");
const uncommittedDirectorPrompt = ref("");
const uncommitedDirectorUpdateId = ref<string | undefined>();

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
async function predictDirectorUpdate(
  writerText: string,
): Promise<{ code: StageCall[] }> {
  const grammar = buildGnbf(scenario.value!);
  console.debug("Director grammar", grammar);

  const directorResponse = await deferredDirector.promise.then((director) =>
    director.infer(`${writerText}\n`, 128, {
      stopSequences: ["\n"],
      grammar,
      temp: 1,
    }),
  );
  console.log("Director response", directorResponse);
  uncommittedDirectorPrompt.value += `${directorResponse}\n`;

  const code: StageCall[] = [];
  for (const line of splitCode(directorResponse)) {
    console.debug("Evaluating stage code", line);
    code.push(...(await stage.eval(line)));
    if (scene.busy) await scene.busy;
  }

  return { code };
}

/**
 * Predict the next writer and director (if enabled) updates.
 */
async function predictUpdates(): Promise<{
  writerUpdate: { text: string };
  directorUpdate?: { code: StageCall[] };
}> {
  const writerUpdateText = await deferredWriter.promise.then((writer) =>
    writer.infer(undefined, 128, {
      stopSequences: ["\n"],
    }),
  );
  const writerUpdate = { text: writerUpdateText };
  console.log("Writer response text", writerUpdateText);
  uncommitedWriterPrompt.value = writerUpdateText + "\n";

  uncommittedDirectorPrompt.value = writerUpdateText + "\n";

  let directorUpdate;
  if (enableDirector.value) {
    directorUpdate = await predictDirectorUpdate(writerUpdateText);
  }

  return { writerUpdate, directorUpdate };
}

/**
 * 1. Commit the caches generated by latest inference.
 * If not committed, pending caches will be discarded
 * upon the next inference /decoding.
 *
 * 2. If the stage state delta is different from the director update,
 * save the new director update to database.
 *
 * 3. Save the stage state to be able to reset it later.
 */
async function commitUncommitted() {
  const promises = [];

  if (uncommitedWriterUpdateId.value) {
    const newKvCacheKey = `${simulationId}:${uncommitedWriterUpdateId.value}`;

    promises.push(
      deferredWriter.promise.then((writer) =>
        writer.commit(newKvCacheKey).then((tokens) => {
          console.debug("Committed to writer", newKvCacheKey, tokens);
          writerPrompt.value += uncommitedWriterPrompt.value;
          uncommitedWriterPrompt.value = "";
          uncommitedWriterUpdateId.value = undefined;
        }),
      ),
    );
  }

  if (uncommitedDirectorUpdateId.value) {
    const newKvCacheKey = `${simulationId}:${uncommitedDirectorUpdateId.value}`;

    promises.push(
      deferredDirector.promise.then((director) =>
        director.commit(newKvCacheKey).then((tokens) => {
          console.debug("Committed to director", newKvCacheKey, tokens);
          directorPrompt.value += uncommittedDirectorPrompt.value;
          uncommittedDirectorPrompt.value = "";
          uncommitedDirectorUpdateId.value = undefined;
        }),
      ),
    );
  }

  const actualDelta = stage.delta(previousStageState.value);
  console.debug("Actual delta", actualDelta);
  console.debug("Latest director update delta", latestDirectorUpdateCode.value);
  const deltasEqual = latestDirectorUpdateCode.value
    ? comparesDeltas(
        stage.state.value,
        actualDelta,
        latestDirectorUpdateCode.value,
      )
    : actualDelta.length === 0;
  console.log("Deltas equal", deltasEqual);

  if (!deltasEqual) {
    console.log("Saving actual delta as a new director update", actualDelta);

    if (!latestWriterUpdate.value) {
      throw new Error("Cannot save director update without a writer update");
    }

    promises.push(
      d.db
        .insert(d.directorUpdates)
        .values({
          writerUpdateId: latestWriterUpdate.value.id,
          code: actualDelta,
        })
        .returning()
        .then((directorUpdates) => {
          // Replace the first director update with the new one.
          latestWriterUpdate.value!.directorUpdates.unshift(directorUpdates[0]);
        }),
    );
  }

  await Promise.all(promises);

  previousStageState.value = clone(stage.state.value);
  console.debug("Saved stage state", previousStageState.value);
}

async function resetStage() {
  fadeDeferred = new Deferred();
  fullFade.value = true;
  return fadeDeferred.promise.then(async () => {
    console.log("Resetting stage");
    stage.setState(previousStageState.value ?? null);
    console.debug("Loaded stage state", previousStageState.value);
    await sleep(50);
    fullFade.value = false;
  });
}

/**
 * Explicitly regenerate the director update for existing writer update.
 */
async function regenerateDirectorUpdate() {
  if (!latestWriterUpdate.value) {
    throw new Error("regenerateDirectorUpdate() requires a writer update");
  }

  busy.value = true;
  try {
    // OPTIMIZE: Infer while waiting for the fade.
    await resetStage();

    const writerText = latestWriterUpdate.value.text;
    latestWriterUpdateText.value = writerText;
    uncommittedDirectorPrompt.value = "";
    const predictedDirectorUpdate = await predictDirectorUpdate(writerText);

    latestDirectorUpdateCode.value = predictedDirectorUpdate.code;

    const directorUpdate = (
      await d.db
        .insert(d.directorUpdates)
        .values({
          writerUpdateId: latestWriterUpdate.value.id,
          code: predictedDirectorUpdate.code,
        })
        .returning()
    )[0];

    latestWriterUpdate.value.directorUpdates.push(directorUpdate);
  } finally {
    busy.value = false;
  }
}

/**
 * Explicitly regenerate the writer update along with
 * the director (if director is enabled) update.
 */
async function regenerateWriterUpdate() {
  if (!latestWriterUpdate.value) {
    throw new Error("regenerateWriterUpdate() requires a writer update");
  }

  busy.value = true;
  try {
    // OPTIMIZE: Infer while waiting for the fade.
    await resetStage();

    // Use the same parent update ID as the pre-latest update.
    let parentUpdateId = preLatestWriterUpdate.value?.id;
    latestWriterUpdateText.value = preLatestWriterUpdate.value?.text || "";

    const predicted = await predictUpdates();

    latestWriterUpdateText.value = predicted.writerUpdate.text;
    latestDirectorUpdateCode.value = predicted.directorUpdate
      ? clone(predicted.directorUpdate.code)
      : [];

    const incoming = await saveUpdatesToDb({
      writerUpdate: {
        parentUpdateId,
        text: predicted.writerUpdate.text,
      },
      directorUpdate: predicted.directorUpdate
        ? {
            code: predicted.directorUpdate.code,
          }
        : undefined,
    });

    uncommitedWriterUpdateId.value = incoming.writerUpdate.id;
    uncommitedDirectorUpdateId.value = incoming.directorUpdate?.id;

    writerUpdates.value.pop();
    writerUpdates.value.push({
      ...incoming.writerUpdate,
      directorUpdates: incoming.directorUpdate ? [incoming.directorUpdate] : [],
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
    latestWriterUpdateText.value = playerInput_;
    await commitUncommitted();

    uncommitedWriterPrompt.value = `${playerInput_}\n`;
    uncommittedDirectorPrompt.value = `${playerInput_}\n`;

    let predictedDirectorUpdate;
    if (enableDirector.value) {
      predictedDirectorUpdate = await predictDirectorUpdate(
        `${playerInput_}\n`,
      );

      uncommittedDirectorPrompt.value += `${stageCallsToLua(predictedDirectorUpdate.code)}\n`;
    }

    const incoming = await saveUpdatesToDb({
      writerUpdate: {
        parentUpdateId: latestWriterUpdate.value?.id,
        text: playerInput_,
        createdByPlayer: true,
      },
      directorUpdate: predictedDirectorUpdate
        ? { code: predictedDirectorUpdate.code }
        : undefined,
    });

    uncommitedWriterUpdateId.value = incoming.writerUpdate.id;
    uncommitedDirectorUpdateId.value = incoming.directorUpdate?.id;

    writerUpdates.value.push({
      ...incoming.writerUpdate,
      directorUpdates: incoming.directorUpdate ? [incoming.directorUpdate] : [],
    });
  } catch (e) {
    if (wouldRestorePlayerInput) {
      playerInput.value = playerInput_;
    }

    latestWriterUpdateText.value = latestWriterUpdate.value?.text || "";

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

  let writerUpdateEpisodeId: string | null = null;
  let writerUpdateEpisodeChunkIndex: number | null = null;

  busy.value = true;
  try {
    await commitUncommitted();

    if (state.value.currentEpisode) {
      console.debug("Advancing episode", state.value.currentEpisode);

      const currentEpisode = state.value.currentEpisode;
      writerUpdateEpisodeId = currentEpisode.id;
      writerUpdateEpisodeChunkIndex = currentEpisode.nextChunkIndex;

      // Advance the episode.
      //

      latestWriterUpdateText.value =
        currentEpisode.chunks[currentEpisode.nextChunkIndex].writerUpdateText;

      const luaCode = stageCallsToLua(
        currentEpisode.chunks[currentEpisode.nextChunkIndex].stageCalls,
      );
      console.debug("Evaluating stage code", luaCode);
      latestDirectorUpdateCode.value = clone(await stage.eval(luaCode));
      if (scene.busy) await scene.busy;

      if (++currentEpisode.nextChunkIndex >= currentEpisode.chunks.length) {
        state.value.currentEpisode = null;
      }

      previousStageState.value = clone(stage.state.value);
      console.debug("Saved stage state", previousStageState.value);

      const incoming = await saveUpdatesToDb({
        writerUpdate: {
          parentUpdateId: latestWriterUpdate.value?.id,
          text: latestWriterUpdateText.value,
          episodeId: writerUpdateEpisodeId,
          episodeChunkIndex: writerUpdateEpisodeChunkIndex,
        },
        directorUpdate: {
          code: latestDirectorUpdateCode.value,
        },
      });

      writerUpdates.value.push({
        ...incoming.writerUpdate,
        directorUpdates: incoming.directorUpdate
          ? [incoming.directorUpdate]
          : [],
      });

      const newWriterPrompt = `${latestWriterUpdateText.value}\n`;
      writerPrompt.value += newWriterPrompt;
      deferredWriter.promise.then((writer) =>
        writer.decode(
          newWriterPrompt,
          `${simulationId}:${incoming.writerUpdate.id}`,
        ),
      );

      if (enableDirector.value) {
        const newDirectorPrompt = `${latestWriterUpdateText.value}\n${stageCallsToLua(latestDirectorUpdateCode.value)};\n`;
        directorPrompt.value += newDirectorPrompt;
        deferredDirector.promise.then((director) =>
          director.decode(
            newDirectorPrompt,
            `${simulationId}:${incoming.directorUpdate!.id}`,
          ),
        );
      }
    } else {
      // Predict the next update.
      // Do not commit it to GPT yet.
      //

      const predicted = await predictUpdates();

      latestWriterUpdateText.value = predicted.writerUpdate.text;
      latestDirectorUpdateCode.value = predicted.directorUpdate
        ? predicted.directorUpdate.code
        : [];

      const incoming = await saveUpdatesToDb({
        writerUpdate: {
          parentUpdateId: latestWriterUpdate.value?.id,
          text: predicted.writerUpdate.text,
        },
        directorUpdate: predicted.directorUpdate,
      });

      uncommitedWriterUpdateId.value = incoming.writerUpdate.id;
      uncommitedDirectorUpdateId.value = incoming.directorUpdate?.id;

      writerUpdates.value.push({
        ...incoming.writerUpdate,
        directorUpdates: incoming.directorUpdate
          ? [incoming.directorUpdate]
          : [],
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
  writerUpdate: {
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
  directorUpdate?: {
    code: StageCall[];
  };
}) {
  return d.db.transaction(async (tx) => {
    const writerUpdate = (
      await tx
        .insert(d.writerUpdates)
        .values({
          simulationId,
          ...updates.writerUpdate,
        })
        .returning()
    )[0];

    let directorUpdate;
    if (updates.directorUpdate) {
      directorUpdate = (
        await tx
          .insert(d.directorUpdates)
          .values({
            writerUpdateId: writerUpdate.id,
            ...updates.directorUpdate,
          })
          .returning()
      )[0];
    }

    await tx
      .update(d.simulations)
      .set({
        headWriterUpdateId: writerUpdate.id,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(d.simulations.id, simulationId));

    return { writerUpdate, directorUpdate };
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

  const committedWriterUpdates = writerUpdates.value.slice(0, -1);
  const committedDirectorUpdates = committedWriterUpdates.map((u) =>
    u.directorUpdates.at(0),
  );

  const latestWriterUpdate = writerUpdates.value.at(-1);
  if (latestWriterUpdate) {
    if (latestWriterUpdate.episodeId) {
      committedWriterUpdates.push(latestWriterUpdate);
      committedDirectorUpdates.push(latestWriterUpdate.directorUpdates.at(0));
    } else {
      // NOTE: Player-created updates are also considered uncommitted.
      uncommitedWriterPrompt.value = `${latestWriterUpdate.text}\n`;
      const code = latestWriterUpdate.directorUpdates.at(0)?.code;
      uncommittedDirectorPrompt.value = `${latestWriterUpdate.text}\n${code ? stageCallsToLua(code) : "noop();"}\n`;
    }
  }

  const textHistory = committedWriterUpdates.map((u) => u.text);
  const codeHistory = committedDirectorUpdates.map((u) => u?.code);

  const writerFullPromptBuilder = () =>
    buildWriterPrompt(scenario.value!, textHistory) + "\n";

  const directorFullPromptBuilder = () =>
    buildDirectorPrompt(
      scenario.value!,
      zip(textHistory, codeHistory).map(([text, code]) => ({
        text,
        code,
      })),
    ) + "\n";

  writerPrompt.value += writerFullPromptBuilder();
  directorPrompt.value += directorFullPromptBuilder();

  const writerPartialPromptBuilder = (from: number, to: number) =>
    textHistory.slice(from, to).join("\n") + "\n";

  const directorPartialPromptBuilder = (from: number, to: number) =>
    zip(textHistory.slice(from, to), codeHistory.slice(from, to))
      .map(
        ([text, code]) =>
          `${text}\n${code ? stageCallsToLua(code) : "noop();"}`,
      )
      .join("\n") + "\n";

  async function syncGptCache(
    gpt: Gpt,
    kvCacheKey: string,
    committedUpdates: ({ id: string } | undefined)[],
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
          committedWriterUpdates,
          writerFullPromptBuilder,
          writerPartialPromptBuilder,
        );
      })
      .then((gpt) => {
        deferredWriter.resolve(gpt);
      }),
  );

  if (enableDirector.value) {
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
            committedDirectorUpdates,
            directorFullPromptBuilder,
            directorPartialPromptBuilder,
          );
        })
        .then((gpt) => {
          deferredDirector.resolve(gpt);
        }),
    );
  }

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
        writer_updates_tree AS (
          SELECT
            ${d.writerUpdates.id.name},
            ${d.writerUpdates.parentUpdateId.name},
            ${d.writerUpdates.createdByPlayer.name},
            ${d.writerUpdates.text.name},
            ${d.writerUpdates.episodeId.name},
            ${d.writerUpdates.episodeChunkIndex.name},
            ${d.writerUpdates.llamaInferenceId.name},
            ${d.writerUpdates.createdAt.name}
          FROM
            ${writerUpdatesTableName}
          WHERE
            ${d.writerUpdates.id.name} = ?
          UNION ALL
          SELECT
            parent.${d.writerUpdates.id.name},
            parent.${d.writerUpdates.parentUpdateId.name},
            parent.${d.writerUpdates.createdByPlayer.name},
            parent.${d.writerUpdates.text.name},
            parent.${d.writerUpdates.episodeId.name},
            parent.${d.writerUpdates.episodeChunkIndex.name},
            parent.${d.writerUpdates.llamaInferenceId.name},
            parent.${d.writerUpdates.createdAt.name}
          FROM
            ${writerUpdatesTableName} parent
            JOIN writer_updates_tree child ON child.${d.writerUpdates.parentUpdateId.name} = parent.${d.writerUpdates.id.name}
        )
      SELECT
        *
      FROM
        writer_updates_tree;
  `),
  );

  // console.debug(query.sql);
  const result = await sqlite.query(query.sql, [simulation.headWriterUpdateId]);
  writerUpdates.value = parseSelectResult(d.writerUpdates, result)
    .map((update) => ({
      ...update,
      directorUpdates: [],
    }))
    .reverse();

  // Attach the latest code updates to the writer updates.
  //

  const directorUpdates = await d.db
    .select({
      id: d.directorUpdates.id,
      writerUpdateId: d.directorUpdates.writerUpdateId,
      code: d.directorUpdates.code,
      createdAt: sql<string>`max(${d.directorUpdates.createdAt})`,
      llamaInferenceId: d.directorUpdates.llamaInferenceId,
    })
    .from(d.directorUpdates)
    .where(
      inArray(
        d.directorUpdates.writerUpdateId,
        writerUpdates.value.map((u) => u.id),
      ),
    )
    .groupBy(d.directorUpdates.writerUpdateId)
    .orderBy(asc(d.directorUpdates.createdAt))
    .all();

  console.debug(directorUpdates);

  for (const directorUpdate of directorUpdates) {
    const writerUpdate = writerUpdates.value.find(
      (u) => u.id === directorUpdate.writerUpdateId,
    );

    if (writerUpdate) {
      writerUpdate.directorUpdates.push(directorUpdate);
    } else {
      throw new Error(
        `For director update ${directorUpdate.id}, writer update ${directorUpdate.writerUpdateId} not found`,
      );
    }
  }

  // TODO: Get initial stage value from the latest snapshot.
  stage = new Stage(scenario.value);
  await stage.initCodeEngine();

  if (writerUpdates.value.length) {
    // Apply existing director updates to the stage.
    let i = 0;
    for (const update of writerUpdates.value) {
      const directorUpdate = update.directorUpdates.at(0);

      if (directorUpdate) {
        const luaCode = stageCallsToLua(directorUpdate.code);
        console.debug("Evaluating stage code", luaCode);
        await stage.eval(luaCode);
      }

      // For the sake of regeneration,
      // save the stage state at the -2nd update.
      // But when there only one update, save -1st.
      if (
        writerUpdates.value.length == 1 ||
        i++ === writerUpdates.value.length - 2
      ) {
        previousStageState.value = clone(stage.state.value);
        console.debug("Saved stage state", previousStageState.value);
      }
    }

    // If the last update has an episode ID, resume from there.
    const latestWriterUpdate = writerUpdates.value.at(-1);
    if (latestWriterUpdate?.episodeId) {
      const episode = scenario.value.episodes.find(
        (e) => e.id === latestWriterUpdate.episodeId,
      );

      if (!episode) {
        throw new Error(`Episode not found: ${latestWriterUpdate.episodeId}`);
      }

      if (latestWriterUpdate.episodeChunkIndex! < episode.chunks.length - 1) {
        state.value.currentEpisode = {
          ...episode,
          nextChunkIndex: latestWriterUpdate.episodeChunkIndex! + 1,
        };
      }
    }
  }

  gameInstance = new Game();
  scene = await gameInstance.createDefaultScene(
    scenario.value,
    "/scenarios/" + simulation.scenarioId,
    clone(stage.state.value),
  );

  assetBaseUrl.value = new URL(
    `/scenarios/${simulation.scenarioId}/`,
    window.location.origin,
  );

  // Connect the stage to the scene.
  stage.connectScene(scene);

  // Register a console event listener.
  window.addEventListener("keypress", consoleEventListener);

  latestWriterUpdateText.value = writerUpdates.value.at(-1)?.text || "";
  latestDirectorUpdateCode.value =
    writerUpdates.value.at(-1)?.directorUpdates.at(0)?.code || [];

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
.flex.h-screen.w-screen
  .relative.h-full.w-full.overflow-hidden
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
          p(:class="{ 'animate-pulse': busy }") {{ latestWriterUpdateText }}

        .flex.flex-col.gap-2
          button.btn.pressable(
            @click="regenerateWriterUpdate"
            :disabled="busy || !canPossiblyRegenerateWriterUpdate"
            class="disabled:cursor-not-allowed disabled:opacity-50"
          )
            RefreshCwIcon(:size="20")
          button.btn.pressable(
            v-if="enableDirector"
            @click="regenerateDirectorUpdate"
            :disabled="busy || !canPossiblyRegenerateDirectorUpdate"
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

  SandboxConsole.h-full.shrink-0.shadow-lg(
    v-if="scenario && assetBaseUrl"
    class="w-1/3"
    :asset-base-url="assetBaseUrl"
    :scenario="scenario"
    :stage="stage"
  )

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

  DeveloperConsole(
    :open="consoleModal"
    :writer="writer"
    :writer-prompt="writerPrompt"
    :uncommited-writer-prompt="uncommitedWriterPrompt"
    :director="director"
    :director-prompt="directorPrompt"
    :uncommited-director-prompt="uncommittedDirectorPrompt"
    :scene-code="stageCallsToLua(latestDirectorUpdateCode || [])"
    :scene-text="latestWriterUpdateText"
    :episode="currentEpisodeConsoleObject"
    :stage-state-delta="stage?.delta(previousStageState) || []"
    @close="consoleModal = false"
  )
</template>
