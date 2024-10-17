import { convertFileSrc } from "@tauri-apps/api/core";
import * as tauriPath from "@tauri-apps/api/path";
import * as tauriFs from "@tauri-apps/plugin-fs";

/**
 * Return a TTS audio file path (the file may or may not exist).
 * @param extension The file extension, e.g. ".wav".
 */
export async function audioFilePath(
  simulationId: number,
  updateId: number,
  extension: string,
): Promise<string> {
  const appDataDirPath = await tauriPath.appLocalDataDir();

  const dirPath = await tauriPath.join(
    appDataDirPath,
    "simulations",
    simulationId.toString(),
    "tts",
  );
  await tauriFs.mkdir(dirPath, { recursive: true });

  const fileName = `${updateId}${extension}`;
  return tauriPath.join(dirPath, fileName);
}

/**
 * Load TTS audio by params.
 */
export async function loadAudio(
  simulationId: number,
  updateId: number,
  extension: string,
): Promise<ArrayBuffer | null> {
  const filePath = await audioFilePath(simulationId, updateId, extension);
  const fileExists = await tauriFs.exists(filePath);

  if (fileExists) {
    const fileUrl = convertFileSrc(filePath);
    const wav = await fetch(fileUrl).then((res) => res.arrayBuffer());
    console.log("Loaded TTS audio from", filePath);
    return wav;
  } else {
    return null;
  }
}

/**
 * Save a TTS audio by params.
 */
export async function saveAudio(
  simulationId: number,
  updateId: number,
  content: Uint8Array,
  extension: string,
): Promise<string> {
  const filePath = await audioFilePath(simulationId, updateId, extension);
  await tauriFs.writeFile(filePath, content);
  console.log("Saved TTS audio to", filePath);
  return filePath;
}
