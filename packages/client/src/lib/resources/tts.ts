import * as fs from "@tauri-apps/api/fs";
import * as path from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/tauri";

/**
 * @param extension The file extension, e.g. ".wav".
 */
export async function audioFilePath(
  simulationId: string,
  updateId: string,
  extension: string,
): Promise<string> {
  const appDataDirPath = await path.appLocalDataDir();

  const dirPath = await path.join(
    appDataDirPath,
    "simulations",
    simulationId,
    "tts",
  );
  await fs.createDir(dirPath, { recursive: true });

  const fileName = `${updateId}${extension}`;
  return path.join(dirPath, fileName);
}

export async function loadAudio(
  simulationId: string,
  updateId: string,
  extension: string,
): Promise<ArrayBuffer | null> {
  const filePath = await audioFilePath(simulationId, updateId, extension);
  const fileExists = await fs.exists(filePath);

  if (fileExists) {
    const fileUrl = convertFileSrc(filePath);
    const wav = await fetch(fileUrl).then((res) => res.arrayBuffer());
    console.log("Loaded TTS audio from", filePath);
    return wav;
  } else {
    return null;
  }
}

export async function saveAudio(
  simulationId: string,
  updateId: string,
  content: fs.BinaryFileContents,
  extension: string,
): Promise<string> {
  const filePath = await audioFilePath(simulationId, updateId, extension);
  await fs.writeBinaryFile(filePath, content);
  console.log("Saved TTS audio to", filePath);
  return filePath;
}
