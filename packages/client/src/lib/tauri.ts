import { appLocalDataDir, BaseDirectory } from "@tauri-apps/api/path";

export * as gpt from "./tauri/gpt";
export * as sqlite from "./tauri/sqlite";

export async function resolveBaseDir(baseDir: BaseDirectory) {
  switch (baseDir) {
    case BaseDirectory.AppLocalData:
      return appLocalDataDir();
    default:
      throw new Error(`Unimplemented for base directory: ${baseDir}`);
  }
}
