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
import { gptPredict } from "@/lib/tauri";

const { simulationId } = defineProps<{ simulationId: string }>();

let gameInstance: Game;
let stage: Stage;
let scene: DefaultScene;
const updates = ref<
  (typeof d.scriptUpdates.$inferSelect & {
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

const novelScript = ref("");
const stageCode = ref("");

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

  if (state.value.currentEpisode) {
    console.debug("Advancing episode", state.value.currentEpisode);
    const currentEpisode = state.value.currentEpisode;

    // Advance the episode.
    //

    novelScript.value =
      currentEpisode.chunks[currentEpisode.nextChunkIndex].novelScript;

    stageCode.value = "";
    for (const line of splitCode(
      currentEpisode.chunks[currentEpisode.nextChunkIndex].stageCode,
    )) {
      console.debug("Evaluating code", line);
      await stage.eval(line);
      stageCode.value += line + "\n";

      if (scene.busy) {
        busy.value = true;
        await scene.busy;
        busy.value = false;
      }
    }

    if (++currentEpisode.nextChunkIndex >= currentEpisode.chunks.length) {
      state.value.currentEpisode = null;
    }
  } else {
    // Predict the next update.
    //

    busy.value = true;
    try {
      const scriptHistory = updates.value.map((u) => u.text);
      const writerPrompt = buildWriterPrompt(scenario.value!, scriptHistory);
      console.log("Writer prompt", writerPrompt);

      // TODO: Llama inference object.
      const writerResponse = await gptPredict(writerPrompt, 128, {
        stopSequences: ["\n"],
      });
      console.log("Writer response", writerResponse);

      const codeHistory = updates.value.map((u) =>
        splitCode(u.codeUpdates.at(0)?.code || ""),
      );

      // TODO: Llama inference object.
      const directorPrompt = buildDirectorPrompt(
        scenario.value!,
        zip(scriptHistory, codeHistory).map(([text, code]) => ({
          code: code.join(";") + ";",
          text,
        })),
        writerResponse,
      );
      console.log("Director prompt", directorPrompt);
      const grammar = buildGnbf(scenario.value!);
      console.log("Director grammar", grammar);
      const directorResponse = await gptPredict(directorPrompt, 128, {
        stopSequences: ["\n"],
        grammar,
        temp: 0,
      });
      console.log("Director response", directorResponse);
      busy.value = false;

      novelScript.value = writerResponse;
      stageCode.value = "";
      for (const line of splitCode(directorResponse)) {
        await stage.eval(line);
        stageCode.value += line + "\n";

        if (scene.busy) {
          busy.value = true;
          await scene.busy;
          busy.value = false;
        }
      }
    } finally {
      busy.value = false;
    }
  }

  const incoming = await d.db.transaction(async (tx) => {
    const scriptUpdate = (
      await tx
        .insert(d.scriptUpdates)
        .values({
          simulationId: simulationId,
          text: novelScript.value,
          episodeId: state.value.currentEpisode
            ? state.value.currentEpisode.id
            : null,
          episodeChunkIndex: state.value.currentEpisode
            ? state.value.currentEpisode.nextChunkIndex
            : null,
        })
        .returning()
    )[0];

    const codeUpdate = (
      await tx
        .insert(d.codeUpdates)
        .values({
          scriptUpdateId: scriptUpdate.id,
          code: splitCode(stageCode.value).join(";") + ";",
        })
        .returning()
    )[0];

    await tx
      .update(d.simulations)
      .set({ updatedAt: new Date().valueOf().toString() })
      .where(eq(d.simulations.id, simulationId));

    return { scriptUpdate, codeUpdate };
  });

  updates.value.push({
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
  updates.value = await d.db.query.scriptUpdates.findMany({
    where: eq(d.scriptUpdates.simulationId, simulationId),
    with: {
      codeUpdates: {
        orderBy: desc(d.codeUpdates.createdAt),
        limit: 1,
      },
    },
    orderBy: asc(d.scriptUpdates.createdAt),

    // ADHOC: See https://github.com/tdwesten/tauri-drizzle-sqlite-proxy-demo/issues/1.
    extras: {
      adhoc: sql`'["codeUpdates"]'`.as("_rel"),
    },
  });

  // TODO: Get initial stage value from the latest snapshot.
  stage = new Stage(scenario.value, undefined);
  await stage.init();
  let initialStage: StageDto | undefined;

  if (updates.value.length) {
    // Apply existing code updates to the stage.
    for (const update of updates.value) {
      const codeUpdate = update.codeUpdates.at(0);
      if (!codeUpdate) continue;
      await stage.eval(codeUpdate.code);
    }

    initialStage = stage.dump();

    // If the last update has an episode ID, resume from there.
    const latestUpdate = updates.value.at(-1);
    if (latestUpdate?.episodeId) {
      const episode = scenario.value.episodes.find(
        (e) => e.id === latestUpdate.episodeId,
      );

      if (!episode) {
        throw new Error(`Episode not found: ${latestUpdate.episodeId}`);
      }

      state.value.currentEpisode = {
        ...episode,
        nextChunkIndex: latestUpdate.episodeChunkIndex! + 1,
      };
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

  // Register a console event listener.
  window.addEventListener("keypress", consoleEventListener);

  novelScript.value = updates.value.at(-1)?.text || "";
  stageCode.value = splitCode(
    updates.value.at(-1)?.codeUpdates.at(0)?.code || "",
  ).join("\n");
});

onUnmounted(() => {
  window.removeEventListener("keypress", consoleEventListener);
});
</script>

<template lang="pug">
.relative.h-screen.w-screen.bg-red-400
  #game-screen
  .absolute.top-0.w-full.bg-white.bg-opacity-50.p-1 {{ scenario?.name }}: {{ simulationId }}
  .absolute.bottom-0.flex.h-32.w-full.flex-col.bg-yellow-500.bg-opacity-90.p-3
    p.grow {{ novelScript }}
    .flex.justify-end
      button.rounded.border.px-3.py-2.pressable(
        @click="advance"
        :disabled="busy"
      ) Next

  Console(
    :open="consoleModal"
    :scene-code="stageCode"
    :scene-text="novelScript"
    :episode="currentEpisodeConsoleObject"
    @close="consoleModal = false"
  )
</template>
