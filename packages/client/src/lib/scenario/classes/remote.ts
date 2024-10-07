import * as api from "@/lib/api";

export class RemoteScenario {
  constructor(
    readonly id: string,
    readonly apiResponse: NonNullable<
      Awaited<
        ReturnType<typeof api.trpc.commandsClient.scenarios.getScenario.query>
      >
    >,
  ) {}

  async resourceUrl(assetPath: string) {
    return (
      import.meta.env.VITE_API_BASE_URL +
      `/rest/v1/scenarios/${this.id}/assets/?version=${this.version}&path=${assetPath}`
    );
  }

  get version() {
    return this.apiResponse.version;
  }

  get locales() {
    return this.apiResponse.locales.map((locale) => new Intl.Locale(locale));
  }

  get name() {
    return this.apiResponse.name;
  }

  get nsfw() {
    return this.apiResponse.nsfw;
  }

  get immersive() {
    return this.apiResponse.immersive;
  }

  get tags() {
    return this.apiResponse.tags;
  }

  get downloadSize() {
    return this.apiResponse.downloadSize;
  }

  async getLogoUrl() {
    if (!this.apiResponse.logo) return undefined;
    return this.resourceUrl(this.apiResponse.logo.path);
  }

  async getThumbnailUrl() {
    if (!this.apiResponse.thumbnail) return undefined;
    return this.resourceUrl(this.apiResponse.thumbnail.path);
  }

  async getCoverImageUrl() {
    if (!this.apiResponse.coverImage) return undefined;
    return this.resourceUrl(this.apiResponse.coverImage.path);
  }

  get teaser() {
    return this.apiResponse.teaser;
  }

  get about() {
    return this.apiResponse.about;
  }

  get characters() {
    return this.apiResponse.characters;
  }

  async getCharacterPfpUrl(characterId: string) {
    const character = this.characters[characterId];
    if (!character.pfp) return undefined;
    return this.resourceUrl(character.pfp.path);
  }

  get episodes() {
    return this.apiResponse.episodes;
  }

  get defaultCharacterId() {
    return Object.keys(this.characters)[0];
  }

  get defaultEpisodeId() {
    return Object.keys(this.episodes)[0];
  }

  get achievements() {
    return this.apiResponse.achievements;
  }
}
