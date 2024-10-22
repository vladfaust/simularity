import * as path from "@tauri-apps/api/path";

export * as gpt from "./tauri/gpt";
export * as sqlite from "./tauri/sqlite";
export * as utils from "./tauri/utils";

export class TauriInvokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TauriInvokeError";
  }
}

export async function resolveBaseDir(baseDir: path.BaseDirectory) {
  switch (baseDir) {
    case path.BaseDirectory.AppLocalData:
      return path.appLocalDataDir();
    case path.BaseDirectory.AppCache:
      return path.appCacheDir();
    default:
      throw new Error(`Unimplemented for base directory: ${baseDir}`);
  }
}

/**
 * There is no parent directory API in the path module,
 * so we have to implement it ourselves.
 *
 * @example parentDir("/home/user/file.txt") => "/home/user"
 */
export async function parentDir(uri: string): Promise<string> {
  const basename = await path.basename(uri);
  return uri.slice(0, -basename.length);
}
