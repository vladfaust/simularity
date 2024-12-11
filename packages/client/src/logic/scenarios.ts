import { env } from "@/env";

export function remoteScenarioAssetUrl(
  scenarioId: string,
  version: number,
  assetPath: string,
) {
  return (
    env.VITE_API_BASE_URL +
    `/rest/v1/scenarios/${scenarioId}/assets/?version=${version}&path=${encodeURIComponent(assetPath)}`
  );
}
