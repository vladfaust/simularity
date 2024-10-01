import type { v } from "@/lib/valibot";
import { join, resolve } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import type { ImmersiveScenarioSchema } from "../schemas/immersive";

export class ImmersiveScenario {
  constructor(
    readonly builtin: boolean,
    readonly id: string,
    readonly basePath: string,
    readonly content: v.InferOutput<typeof ImmersiveScenarioSchema>,
  ) {}

  async resourceUrl(path: string) {
    return join(this.basePath, path).then(resolve).then(convertFileSrc);
  }

  async getThumbnailUrl() {
    if (!this.content.thumbnailPath) return undefined;
    return this.resourceUrl(this.content.thumbnailPath);
  }

  async getCoverImageUrl() {
    if (!this.content.coverImagePath) return undefined;
    return this.resourceUrl(this.content.coverImagePath);
  }

  async getMediaUrls() {
    return this.content.media
      ? Promise.all(
          this.content.media?.map((media) => this.resourceUrl(media.path)),
        )
      : [];
  }

  get defaultCharacterId() {
    return Object.keys(this.content.characters)[0];
  }

  get defaultCharacter() {
    return this.content.characters[this.defaultCharacterId];
  }

  async getCharacterPfpUrl(characterId: string) {
    const character = this.ensureCharacter(characterId);
    if (!character.pfpPath) return undefined;
    return this.resourceUrl(character.pfpPath);
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
