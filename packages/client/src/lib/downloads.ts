import * as tauri from "@/lib/tauri";
import * as fs from "@tauri-apps/api/fs";
import * as path from "@tauri-apps/api/path";
import { nanoid } from "nanoid";
import * as fsExtra from "tauri-plugin-fs-extra-api";
import {
  computed,
  markRaw,
  ref,
  shallowRef,
  triggerRef,
  type Ref,
  type ShallowRef,
} from "vue";
import type { LlmAgentId } from "./storage/llm";
import { download, fileSha256 } from "./tauri/utils";
import type { Response as DownloadResponse } from "./tauri/utils/download";
import { v } from "./valibot";

const DownloadFileSchema = v.object({
  paused: v.optional(v.boolean()),
  files: v.array(
    v.object({
      url: v.string(),
      targetPath: v.string(),
      completed: v.boolean(),
      error: v.optional(v.string()),

      /**
       * Total number of bytes to download (may be unknown).
       */
      contentLength: v.optional(v.number()),

      /**
       * Path to the temporary file where the download is stored.
       * If not provided, a temporary file will be created.
       */
      tempPath: v.optional(v.string()),

      /**
       * Optional hashes for the file to verify integrity.
       */
      hashes: v.optional(
        v.object({
          sha256: v.optional(v.string()),
        }),
      ),
    }),
  ),
});

type DownloadHandler = {
  error: Ref<Error | undefined>;

  abortController: AbortController;
  onReturn: Promise<DownloadResponse>;

  /**
   * Number of bytes downloaded so far.
   */
  currentFileSize: Ref<number | undefined>;

  /**
   * Total number of bytes to download.
   */
  contentLength: Ref<number | undefined>;

  /**
   * Last known download speed in bytes per second.
   */
  latestSpeed: Ref<number | undefined>;
};

export class Download {
  /**
   * Unique ID of the download, derived from the meta file path.
   * @example `downloads/abc123.download` -> `abc123`
   */
  readonly id: string;

  /**
   * Full path to the `.download` meta file.
   */
  readonly metaPath: string;

  /**
   * Whether the download is currently paused.
   */
  readonly paused: Ref<boolean>;

  /**
   * List of files to download.
   */
  readonly files: {
    url: string;
    targetPath: string;
    completed: Ref<boolean>;
    error: Ref<string | undefined>;

    /**
     * When the download has not started yet,
     * but the file has already been partially downloaded.
     *
     * Use `downloadHandlers[file.tempPath].currentFileSize` after resuming.
     */
    initialFileSize?: number;

    contentLength: Ref<number | undefined>;
    tempPath: Ref<string | undefined>;
    hashes?: {
      sha256?: string;
    };
  }[];

  private readonly _onCompleteCallbacks: (() => void)[] = [];

  /**
   * List of download handlers for each of the temporary files.
   * @example downloadHandlers[file.tempPath.value]
   */
  readonly downloadHandlers: ShallowRef<Map<string, DownloadHandler>> =
    shallowRef(new Map());

  /**
   * Total computed content length of all files.
   */
  readonly totalContentLength = computed(() =>
    this.files.reduce((acc, f) => (acc += f.contentLength.value ?? 0), 0),
  );

  /**
   * Total computed downloaded file sizes of all files.
   */
  readonly totalFileSize = computed(() => {
    let totalFileSize = 0;

    for (const file of this.files) {
      if (file.completed.value) {
        if (file.contentLength.value === undefined) {
          console.warn(
            `In totalFileSize: completed file content length is still undefined`,
            { targetPath: file.targetPath },
          );
        } else {
          totalFileSize += file.contentLength.value;
        }
      } else if (file.tempPath.value) {
        const downloadHandler = this.downloadHandlers.value.get(
          file.tempPath.value,
        );

        if (downloadHandler) {
          totalFileSize +=
            downloadHandler.currentFileSize.value ?? file.initialFileSize ?? 0;
        } else {
          totalFileSize += file.initialFileSize ?? 0;
        }
      }
    }

    return totalFileSize;
  });

  /**
   * Total computed progress, from 0 to 1.
   */
  readonly progress = computed(() => {
    return this.totalFileSize.value / this.totalContentLength.value;
  });

  /**
   * Average download speed, in bytes per second, or undefined if not downloading.
   */
  readonly averageSpeed = computed(() => {
    const allSpeeds: number[] = [];

    for (const file of this.files) {
      if (file.tempPath.value) {
        const downloadHandler = this.downloadHandlers.value.get(
          file.tempPath.value,
        );

        if (downloadHandler?.latestSpeed.value !== undefined) {
          allSpeeds.push(downloadHandler.latestSpeed.value);
        }
      }
    }

    if (allSpeeds.length) {
      return (
        allSpeeds.reduce((acc, speed) => (acc += speed), 0) / allSpeeds.length
      );
    } else {
      return undefined;
    }
  });

  /**
   * Get a new random temporary path.
   */
  static async tempPath() {
    // FIXME: Use temp dir instead ($TEMP/**/* doesn't work in tauri config).
    const tempDir = await tauri.resolveBaseDir(path.BaseDirectory.AppCache);
    const downloadsDir = await path.join(tempDir, "downloads");
    await fs.createDir(downloadsDir, { recursive: true });
    return path.join(downloadsDir, nanoid());
  }

  /**
   * Create a new `Download` instance for a list of files.
   *
   * @param metaPath - Path to the `.download` meta file.
   * @param files - List of files to download.
   * @param paused - Whether the download should start paused (default: `false`).
   */
  static async create(
    metaPath: string,
    files: {
      url: string;
      targetPath: string;
      tempPath?: string;
      hashes?: {
        sha256?: string;
      };
    }[],
    paused = false,
  ): Promise<Download> {
    if (await fs.exists(metaPath)) {
      throw new Error(`Download already exists at ${metaPath}`);
    }

    const download = new Download(
      (await path.basename(metaPath)).replace(/\.download$/, ""),
      metaPath,
      files.map((file) => ({
        ...file,
        completed: ref(false),
        error: ref(undefined),
        contentLength: ref(undefined),
        tempPath: ref(file.tempPath),
      })),
      paused,
    );

    await download.writeMetaFile();

    return download;
  }

  /**
   * Create new `Download` from an existing `.download` meta file.
   *
   * SAFETY: There must be no other `Download` instance for the same meta file.
   */
  static async read(metaPath: string): Promise<Download> {
    const contents = await fs.readTextFile(metaPath);
    const data = JSON.parse(contents);
    const { files, paused } = v.parse(DownloadFileSchema, data);

    return new Download(
      (await path.basename(metaPath)).replace(/\.download$/, ""),
      metaPath,
      await Promise.all(
        files.map(async (file) => ({
          ...file,
          completed: ref(file.completed),
          error: ref(file.error),
          contentLength: ref(file.contentLength),
          tempPath: ref(file.tempPath),
          initialFileSize: file.tempPath
            ? (await fsExtra.exists(file.tempPath))
              ? (await fsExtra.metadata(file.tempPath)).size
              : undefined
            : undefined,
        })),
      ),
      paused,
    );
  }

  private constructor(
    id: string,
    metaPath: string,
    files: Download["files"],
    paused = false,
  ) {
    this.id = id;
    this.metaPath = metaPath;
    this.files = files;
    this.paused = ref(paused);

    if (!paused) {
      this.resume(true);
    }
  }

  /**
   * Resume the download.
   * Noop if the download is already resumed.
   */
  async resume(force = false) {
    if (!force && !this.paused.value) {
      return;
    }

    this.paused.value = false;

    for (const file of this.files) {
      if (file.completed.value) {
        console.debug(`Skipping completed file: ${file.targetPath}`);
        continue;
      }

      const tempPath = (file.tempPath.value ||= await Download.tempPath());
      console.log(`Downloading from ${file.url} to ${tempPath}`);

      const handler = Download.createDownloadHandler(file.url, tempPath, file);
      this.downloadHandlers.value.set(tempPath, handler);
      triggerRef(this.downloadHandlers);

      handler.onReturn.then(async (result) => {
        this.downloadHandlers.value.delete(tempPath);
        triggerRef(this.downloadHandlers);
        file.contentLength.value = result.targetContentLength;

        if (!result.aborted) {
          console.log(`Download completed: ${tempPath}`);
          file.completed.value = true;

          if (file.hashes?.sha256) {
            console.log(`Verifying SHA-256 hash for ${tempPath}`);
            const sha256 = await fileSha256(tempPath);

            if (sha256 !== file.hashes.sha256) {
              const error = `SHA-256 mismatch for ${tempPath}: expected ${file.hashes.sha256}, got ${sha256}`;
              console.error(error);
              file.error.value = error;
              return;
            }
          }

          console.log(`Moving ${tempPath} to ${file.targetPath}`);
          await fs.renameFile(tempPath, file.targetPath);

          if (this.files.every((f) => f.completed)) {
            console.log("All downloads completed");
            await this.destroy();
            for (const cb of this._onCompleteCallbacks) cb();
            return;
          }
        }

        await this.writeMetaFile();
      });
    }

    // Save the updates.
    await this.writeMetaFile();
  }

  /**
   * Pause the download.
   * Noop if the download is already paused.
   */
  async pause() {
    if (this.paused.value) {
      return;
    }

    this.paused.value = true;

    for (const [tempPath, handler] of this.downloadHandlers.value) {
      const file = this.files.find((f) => f.tempPath.value === tempPath)!;
      file.initialFileSize = handler.currentFileSize.value;
      handler.abortController.abort("pause");
    }

    // Save the "paused" state.
    await this.writeMetaFile();
  }

  /**
   * Destroy the `Download` instance, cleaning up resources and removing the meta file.
   */
  async destroy() {
    console.log(`Destroying download: ${this.metaPath}`);

    this.downloadHandlers.value.forEach((handler) =>
      handler.abortController.abort(),
    );

    console.debug("Waiting for download handlers to return...");
    await Promise.all(
      [...this.downloadHandlers.value.values()].map((h) => h.onReturn),
    );

    for (const file of this.files) {
      if (file.tempPath.value && !file.completed.value) {
        console.log(
          `Removing incomplete temporary file: ${file.tempPath.value}`,
        );

        await fs.removeFile(file.tempPath.value);
      }
    }

    console.log(`Removing meta file: ${this.metaPath}`);
    await fs.removeFile(this.metaPath);

    downloadManager.downloads.delete(this.id);
  }

  /**
   * Add a callback to be called when all downloads are completed,
   * after the download is destroyed.
   */
  onComplete(cb: () => void) {
    this._onCompleteCallbacks.push(cb);
  }

  /**
   * Create a download handler for a file.
   * Effectively starts the download.
   */
  private static createDownloadHandler(
    url: string,
    path: string,
    file: {
      contentLength: Ref<number | undefined>;
    },
  ): DownloadHandler {
    const abortController = new AbortController();
    const currentFileSize = ref<number | undefined>();
    const contentLength = ref<number | undefined>();
    const latestSpeed = ref<number | undefined>();
    const error = ref<Error | undefined>();

    const onReturn = download(
      url,
      path,
      (event) => {
        currentFileSize.value = event.currentFileSize;
        contentLength.value = event.targetContentLength;
        file.contentLength.value = event.targetContentLength;
        latestSpeed.value = event.downloadedBytes / (event.elapsedTime / 1000);
      },
      abortController.signal,
    );

    onReturn.catch((e) => {
      console.error(`Download error for ${url} to ${path}:`, e);
      error.value = e;
    });

    return {
      abortController,
      currentFileSize,
      contentLength,
      latestSpeed,
      onReturn,
      error,
    };
  }

  private async writeMetaFile() {
    const data = JSON.stringify({
      paused: this.paused.value,
      files: this.files.map((file) => ({
        url: file.url,
        targetPath: file.targetPath,
        completed: file.completed.value,
        error: file.error.value,
        contentLength: file.contentLength.value,
        tempPath: file.tempPath.value,
        hashes: file.hashes,
      })),
    } satisfies v.InferOutput<typeof DownloadFileSchema>);

    await fs.writeFile(this.metaPath, data);
  }
}

export class DownloadManager {
  /**
   * Map of all known downloads, indexed by their unique ID.
   */
  readonly downloads: Map<string, Download> = new Map();

  /**
   * Create a new download.
   *
   * @param metaPath - Path to the `.download` meta file.
   * @param files - List of files to download.
   * @param paused - Whether the download should start paused (default: `false`).
   */
  async create(
    metaPath: string,
    files: {
      url: string;
      targetPath: string;
      tempPath?: string;
      hashes?: {
        sha256?: string;
      };
    }[],
    paused = false,
  ): Promise<Download> {
    const download = markRaw(await Download.create(metaPath, files, paused));
    this.downloads.set(download.id, download);
    return download;
  }

  /**
   * Iterate over files in a directory to find `.download` files.
   * Returns a list of downloads, already created or newly found.
   */
  async readDir(dir: string) {
    const entries = await fs.readDir(dir);
    const downloads: Download[] = [];

    for (const entry of entries) {
      if (!entry.name?.endsWith(".download")) {
        console.debug(`Skipping non-download file: ${entry.path}`);
        continue;
      }

      let download = this.downloads.get(entry.path);
      if (download) {
        console.debug(`Found existing .download file: ${entry.path}`);
        downloads.push(download);
        continue;
      }

      console.log(`Found new .download file: ${entry.path}`);
      download = markRaw(await Download.read(entry.path));
      this.downloads.set(download.id, download);
      downloads.push(download);
    }

    return downloads;
  }

  /**
   * Check all known directories for `.download` files.
   */
  async init() {
    await Promise.all([
      this.initLlmAgentDir("writer"),
      this.initLlmAgentDir("director"),
    ]);
  }

  private async initLlmAgentDir(agentId: LlmAgentId) {
    return path
      .join(await path.appLocalDataDir(), "models", agentId)
      .then(async (dir) => {
        await fs.createDir(dir, { recursive: true });
        return this.readDir(dir);
      });
  }
}

export const downloadManager = new DownloadManager();
