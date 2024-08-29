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

  /** Default API server base URL. */
  readonly VITE_API_BASE_URL: string;

  /** Default web server base URL. */
  readonly VITE_WEB_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
