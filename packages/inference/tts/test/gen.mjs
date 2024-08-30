// Generate lots of samples with different parameters.
// Usage: test/gen.js <api-url> <embeddings-path> <inputs-path> <output-dir>
//

import fs from "fs";

const apiUrl = process.argv[2];
const embeddingsPath = process.argv[3];
const inputsPath = process.argv[4];
const outputDir = process.argv[5];

const inputsJson = fs.readFileSync(inputsPath, "utf-8");

/**
 * @type {[{text: string; language: string; overlapWavLength?: number; temperature?: number; lengthPenalty?: number; repetitionPenalty?: number; topK?: number; topP?: number; speed?: number}]}
 */
const inputs = JSON.parse(inputsJson);

// Make sure the output directory exists.
fs.mkdirSync(outputDir, { recursive: true });

/**
 * @type {{gpt_cond_latent: number[][]; speaker_embedding: number[]}}
 */
const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, "utf-8"));

/**
 * @param {{ overlapWavLength?: number; temperature?: number; lengthPenalty?: number; repetitionPenalty?: number; topK?: number; topP?: number; speed?: number; }} input
 */
async function tts(input) {
  console.log(input);

  const result = await fetch(`${apiUrl}/tts_raw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...embeddings,
      ...input,
    }),
  });

  if (!result.ok) {
    throw new Error(`Failed to fetch: ${result.status} ${await result.text()}`);
  }

  const buffer = await result.arrayBuffer();

  const fileName = `${outputDir}/${JSON.stringify(input)}.wav`;
  fs.writeFileSync(fileName, Buffer.from(buffer));

  console.log(`Saved to ${fileName}`);
}

for (const input of inputs) {
  await tts(input);
}
