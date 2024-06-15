import { v } from "@/lib/valibot.js";

export const InferenceNodeSchema = v.object({
  /**
   * The ID of the inference node.
   * Must be an alphanumeric string with dashes and underscores.
   */
  id: v.pipe(v.string(), v.regex(/^[a-z\d\-_]+$/i), v.maxLength(255)),

  /**
   * The base URL of the inference node to send requests to.
   */
  baseUrl: v.pipe(v.string(), v.url()),

  /**
   * The GPT model of the node.
   */
  gptModel: v.pipe(v.string(), v.maxLength(255)),
});

export function inferenceNodeKey(inferenceNodeId: string) {
  return `inference-nodes:${inferenceNodeId}`;
}

export function inferenceNodeKeyPattern() {
  return "inference-nodes:*";
}
