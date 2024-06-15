import { konsole } from "@/lib/konsole.js";
import { redis } from "@/lib/redis.js";
import { safeParseJson } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import {
  InferenceNodeSchema,
  inferenceNodeKeyPattern,
} from "../inferenceNodes/common.js";

/**
 * Find an inference node by model.
 */
export async function findInferenceNode(
  model: string,
): Promise<v.InferOutput<typeof InferenceNodeSchema> | null> {
  const keys = await redis.keys(inferenceNodeKeyPattern());

  for (const key of keys) {
    const value = await redis.get(key);
    if (!value) {
      konsole.warn("(Rare) Node is null at key", { key });
      continue;
    }

    const nodeAny = safeParseJson(value);
    if (!nodeAny) {
      konsole.warn("Node is not JSON at key", { key });
      continue;
    }

    const nodeParseResult = v.safeParse(InferenceNodeSchema, nodeAny);
    if (!nodeParseResult.success) {
      konsole.warn("Node is not a valid object", {
        key,
        nodeAny,
        issues: JSON.stringify(v.flatten(nodeParseResult.issues)),
      });

      continue;
    }

    if (nodeParseResult.output.gptModel !== model) {
      continue;
    }

    return nodeParseResult.output;
  }

  return null;
}
