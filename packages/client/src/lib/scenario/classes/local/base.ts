import type { v } from "@/lib/valibot";
import * as schema from "@simularity/api/lib/schema";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as tauriPath from "@tauri-apps/api/path";

export class LocalBaseScenario {
  constructor(
    readonly builtin: boolean,
    readonly id: string,
    readonly basePath: string,
    readonly content: v.InferOutput<typeof schema.scenarios.BaseScenarioSchema>,
  ) {}

  get manifest() {
    return this.content;
  }

  get version() {
    return this.content.version;
  }

  get locales() {
    return this.content.locales.map((locale) => new Intl.Locale(locale));
  }

  get name() {
    return this.content.name;
  }

  get nsfw() {
    return this.content.nsfw;
  }

  get immersive() {
    return false;
  }

  get contextWindowSize() {
    return this.content.contextWindowSize;
  }

  get teaser() {
    return this.content.teaser;
  }

  get about() {
    return this.content.about;
  }

  get tags() {
    return this.content.tags;
  }

  async resourceUrl(path: string) {
    return tauriPath
      .join(this.basePath, path)
      .then(tauriPath.resolve)
      .then(convertFileSrc);
  }

  async getLogoUrl() {
    if (!this.content.logo) return undefined;
    return this.resourceUrl(this.content.logo.path);
  }

  async getThumbnailUrl() {
    if (!this.content.thumbnail) return undefined;
    return this.resourceUrl(this.content.thumbnail.path);
  }

  async getCoverImageUrl() {
    if (!this.content.coverImage) return undefined;
    return this.resourceUrl(this.content.coverImage.path);
  }

  get characters() {
    return this.content.characters;
  }

  get defaultCharacterId() {
    return Object.keys(this.content.characters)[0];
  }

  get defaultCharacter() {
    return this.content.characters[this.defaultCharacterId];
  }

  async getCharacterPfpUrl(characterId: string) {
    const character = this.ensureCharacter(characterId);
    if (!character.pfp) return undefined;
    return this.resourceUrl(character.pfp.path);
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

  get achievements() {
    return this.content.achievements;
  }
}
