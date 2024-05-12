import { z } from "zod";

const GptSchema = z.object({
  modelPath: z.string(),
  contextSize: z.number().int().positive(),
  batchSize: z.number().int().positive(),
});

export const viteEnv = z
  .object({
    VITE_DEFAULT_SCENARIO_ID: z.string(),
    VITE_GPT_WRITER: z
      .string()
      .transform((x) => JSON.parse(x))
      .pipe(GptSchema),
    VITE_GPT_DIRECTOR: z
      .string()
      .transform((x) => JSON.parse(x))
      .pipe(GptSchema),
    VITE_DATABASE_PATH: z.string(),
  })
  .safeParse(import.meta.env);

if (!viteEnv.success) {
  console.error(viteEnv.error);
  throw new Error("Vite environment variables are invalid.");
}

const {
  VITE_DEFAULT_SCENARIO_ID,
  VITE_GPT_WRITER,
  VITE_GPT_DIRECTOR,
  VITE_DATABASE_PATH,
} = viteEnv.data;

export const DEFAULT_SCENARIO_ID = VITE_DEFAULT_SCENARIO_ID;
export const GPT_WRITER = VITE_GPT_WRITER;
export const GPT_DIRECTOR = VITE_GPT_DIRECTOR;
export const DATABASE_PATH = VITE_DATABASE_PATH;
