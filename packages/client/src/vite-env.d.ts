/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface ImportMetaEnv {
  /** The default scenario ID, to be found at /public/scenarios/:id.  */
  readonly VITE_DEFAULT_SCENARIO_ID: string;

  /** GPT settings for the writer. */
  readonly VITE_GPT_WRITER: string;

  /** GPT settings for the director. */
  readonly VITE_GPT_DIRECTOR: string;

  /** SQLite database path, relative to $APPLOCALDATA. */
  readonly VITE_DATABASE_PATH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
