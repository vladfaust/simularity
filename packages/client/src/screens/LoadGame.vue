<script setup lang="ts">
import { onMounted, ref } from "vue";
import { routeLocation } from "@/lib/router";
import { getGames } from "@/lib/db";

const games = ref<Awaited<ReturnType<typeof getGames>>>([]);

onMounted(async () => {
  games.value = await getGames(10);
});
</script>

<template lang="pug">
.flex.flex-col.gap-3.p-4
  h1 Load games
  .grid.grid-cols-3.gap-3
    RouterLink.overflow-hidden.rounded-lg.transition-transform.pressable(
      v-for="game of games"
      :to="routeLocation({ name: 'Game', params: { gameId: game.id } })"
    )
      img(v-if="game.screenshot" :src="game.screenshot")
</template>

<style lang="scss" scoped></style>
