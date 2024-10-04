import * as v from "valibot";

export * from "./scenarios/base.js";
export * from "./scenarios/immersive.js";

import {
  AssetSchema,
  BaseScenarioSchema,
  ImmersiveScenarioSchema,
  baseScenarioAssets,
  immersiveScenarioAssets,
} from "./scenarios.js";

export const ScenarioSchema = v.union([
  BaseScenarioSchema,
  ImmersiveScenarioSchema,
]);

/**
 * Safely parse a scenario manifest.
 */
export function safeParseScenarioManifest(manifestJson: any):
  | {
      success: true;
      output:
        | v.InferOutput<typeof BaseScenarioSchema>
        | v.InferOutput<typeof ImmersiveScenarioSchema>;
    }
  | {
      success: false;
      issues:
        | [
            v.InferIssue<typeof BaseScenarioSchema>,
            ...v.InferIssue<typeof BaseScenarioSchema>[],
          ]
        | [
            v.InferIssue<typeof ImmersiveScenarioSchema>,
            ...v.InferIssue<typeof ImmersiveScenarioSchema>[],
          ];
    } {
  if ("immersive" in manifestJson && manifestJson.immersive) {
    const result = v.safeParse(ImmersiveScenarioSchema, manifestJson);

    if (!result.success) {
      return { success: false, issues: result.issues };
    }

    return { success: true, output: result.output };
  } else {
    const result = v.safeParse(BaseScenarioSchema, manifestJson);

    if (!result.success) {
      return { success: false, issues: result.issues };
    }

    return { success: true, output: result.output } as any;
  }
}

/**
 * Iterate over all assets in the scenario.
 */
export function* scenarioAssets(
  manifest:
    | v.InferOutput<typeof ImmersiveScenarioSchema>
    | v.InferOutput<typeof BaseScenarioSchema>,
): Generator<{
  jsonpath: string;
  public?: boolean;
  asset: v.InferOutput<typeof AssetSchema>;
}> {
  if ("immersive" in manifest && manifest.immersive) {
    for (const entry of immersiveScenarioAssets(
      manifest as v.InferOutput<typeof ImmersiveScenarioSchema>,
    )) {
      yield entry;
    }
  } else {
    for (const entry of baseScenarioAssets(
      manifest as v.InferOutput<typeof BaseScenarioSchema>,
    )) {
      yield entry;
    }
  }
}
