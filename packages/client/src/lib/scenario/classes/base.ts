import type { v } from "@/lib/valibot";
import { join, resolve } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import type { BaseScenarioSchema } from "../schemas/base";

export class BaseScenario {
  constructor(
    readonly builtin: boolean,
    readonly id: string,
    readonly basePath: string,
    readonly content: v.InferOutput<typeof BaseScenarioSchema>,
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
