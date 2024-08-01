/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface ImportMetaEnv {
  /** The default scenario ID, to be found at /public/scenarios/:id.  */
  readonly VITE_DEFAULT_SCENARIO_ID: string;

  /** SQLite database path, relative to $APPLOCALDATA. */
  readonly VITE_DATABASE_PATH: string;

  /** Default remote inference server base URL. */
  readonly VITE_DEFAULT_REMOTE_INFERENCE_SERVER_BASE_URL: string;

  /** Default remote inference model for Writer. */
  readonly VITE_DEFAULT_REMOTE_WRITER_MODEL: string;

  /** Default remote inference model for Director. */
  readonly VITE_DEFAULT_REMOTE_DIRECTOR_MODEL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
