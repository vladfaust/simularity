import type { v } from "@/lib/valibot";
import * as schema from "@simularity/api/lib/schema";
import { LocalBaseScenario } from "./base";

export class LocalImmersiveScenario extends LocalBaseScenario {
  constructor(
    readonly builtin: boolean,
    readonly id: string,
    readonly basePath: string,
    readonly content: v.InferOutput<
      typeof schema.scenarios.ImmersiveScenarioSchema
    >,
  ) {
    super(builtin, id, basePath, content);
  }

  get immersive() {
    return true;
  }

  get characters() {
    return this.content.characters;
  }

  findCharacter(characterId: string) {
    const scene = this.content.characters[characterId];
    if (!scene) return undefined;
    return scene;
  }

  ensureCharacter(characterId: string) {
    const found = this.findCharacter(characterId);
    if (!found) throw new Error(`Character not found: ${characterId}`);
    return found;
  }

  defaultOutfitId(characterId: string) {
    const character = this.ensureCharacter(characterId);
    return Object.keys(character.outfits)[0];
  }

  findOutfit(characterId: string, outfitId: string) {
    const character = this.ensureCharacter(characterId);
    const outfit = character.outfits[outfitId];
    if (!outfit) return undefined;
    return outfit;
  }

  ensureOutfit(characterId: string, outfitId: string) {
    const found = this.findOutfit(characterId, outfitId);
    if (!found) throw new Error(`Outfit not found: ${outfitId}`);
    return found;
  }

  defaultExpressionId(characterId: string) {
    const character = this.ensureCharacter(characterId);
    return character.expressions[0];
  }

  findExpression(characterId: string, expressionId: string) {
    const character = this.ensureCharacter(characterId);
    if (!character.expressions.includes(expressionId)) return undefined;
    return expressionId;
  }

  ensureExpression(characterId: string, expressionId: string) {
    const found = this.findExpression(characterId, expressionId);
    if (!found) throw new Error(`Expression not found: ${expressionId}`);
    return found;
  }

  get defaultSceneId() {
    return Object.keys(this.content.scenes)[0];
  }

  get defaultScene() {
    return this.content.scenes[this.defaultSceneId];
  }

  findScene(sceneId: string) {
    const scene = this.content.scenes[sceneId];
    if (!scene) return undefined;
    return scene;
  }

  ensureScene(sceneId: string) {
    const found = this.findScene(sceneId);
    if (!found) throw new Error(`Scene not found: ${sceneId}`);
    return found;
  }

  get episodes() {
    return this.content.episodes;
  }

  findEpisode(episodeId: string) {
    const episode = this.content.episodes[episodeId];
    if (!episode) return undefined;
    return episode;
  }

  ensureEpisode(episodeId: string) {
    const found = this.findEpisode(episodeId);
    if (!found) throw new Error(`Episode not found: ${episodeId}`);
    return found;
  }

  get defaultEpisodeId() {
    return Object.keys(this.content.episodes)[0];
  }

  get defaultEpisode() {
    return this.content.episodes[this.defaultEpisodeId];
  }
}
