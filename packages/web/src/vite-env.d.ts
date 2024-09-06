/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_PATREON_CAMPAIGN_URL: string;
  readonly VITE_DISCORD_URL: string;
  readonly VITE_TWITTER_URL: string;
  readonly VITE_DOWNLOAD_DARWIN_ARM64_URL: string;
}
