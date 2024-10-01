import type { BaseLlmDriver } from "@/lib/ai/llm/BaseLlmDriver";
import { RemoteLlmDriver } from "@/lib/ai/llm/RemoteLlmDriver";
import { TauriLlmDriver } from "@/lib/ai/llm/TauriLlmDriver";
import * as storage from "@/lib/storage";
import type { LlmAgentId } from "@/lib/storage/llm";
import { clone, unreachable } from "@/lib/utils";
import { watchImmediate } from "@vueuse/core";
import type { ShallowRef, WatchStopHandle } from "vue";

/**
 * Hooks an LLM agent to a driver reference.
 *
 * @param localContextSizeModifier A function to modify
 * the context size of a local driver.
 *
 * @returns A watch stop handle.
 */
export function hookLlmAgentToDriverRef(
  agentId: LlmAgentId,
  driverRef: ShallowRef<BaseLlmDriver | null>,
  initialPromptBuilder: () => string,
  localContextSizeModifier?: (driverContextSize: number) => number,
): WatchStopHandle {
  const driverConfig = storage.llm.useDriverConfig(agentId);
  const latestSession = storage.llm.useLatestSession(agentId);

  return watchImmediate(
    () => driverConfig.value,
    async (driverConfig) => {
      console.debug("Driver config watch trigger", agentId, driverConfig);

      if (localContextSizeModifier && driverConfig?.type === "local") {
        // Clone the driver config to a local variable.
        driverConfig = clone(driverConfig);

        driverConfig.contextSize = localContextSizeModifier(
          driverConfig.contextSize,
        );
      }

      if (driverConfig) {
        if (driverRef.value) {
          console.debug("Comparing driver configs.", agentId, {
            other: driverConfig,
          });
          if (!driverRef.value.compareConfig(driverConfig)) {
            console.log(
              "Driver config is different, destroying the driver.",
              agentId,
            );
            driverRef.value.destroy();
            driverRef.value = null;
            latestSession.value = null;
          } else {
            console.debug("Driver config is the same.", agentId);
            return;
          }
        }

        switch (driverConfig.type) {
          case "local": {
            let driver: TauriLlmDriver | null = null;

            if (latestSession.value?.driver === "local") {
              driver = await TauriLlmDriver.find(
                agentId,
                latestSession.value.id,
                driverConfig,
              );
            }

            if (!driver) {
              console.log("Creating new TauriLlmDriver", agentId, driverConfig);

              const initialPrompt = initialPromptBuilder();

              driver = TauriLlmDriver.create(
                agentId,
                driverConfig,
                {
                  initialPrompt,
                  dumpSession: true,
                  callback: ({ databaseSessionId }) => {
                    latestSession.value = {
                      driver: "local",
                      id: databaseSessionId,
                    };
                  },
                },
                false,
              );
            } else {
              console.log(`Restored TauriLlmDriver`, {
                agent: agentId,
                latestSession: latestSession.value,
                driverConfig,
              });
            }

            driverRef.value = driver;
            break;
          }

          case "remote": {
            console.log("Creating new RemoteLlmDriver", {
              agent: agentId,
              driverConfig,
              latestSession: latestSession.value,
            });

            driverRef.value = await RemoteLlmDriver.create(
              driverConfig,
              latestSession,
              storage.remoteServerJwt,
            );

            break;
          }

          default:
            throw unreachable(driverConfig);
        }
      } else {
        // New driver config is empty.
        // Destroy the driver instance if it exists.
        if (driverRef.value) {
          driverRef.value.destroy();
          driverRef.value = null;
        }
      }
    },
  );
}
