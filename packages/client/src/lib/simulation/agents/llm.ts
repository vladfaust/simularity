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
 * @param contextSizeModifier A function to modify the context size
 * (only for local drivers).
 *
 * @returns A watch stop handle.
 */
export function hookLlmAgentToDriverRef(
  agent: LlmAgentId,
  driverRef: ShallowRef<BaseLlmDriver | null>,
  initialPromptBuilder: () => string,
  contextSizeModifier?: (contextSize: number) => number,
): WatchStopHandle {
  const driverConfig = storage.llm.useDriverConfig(agent);
  const latestSession = storage.llm.useLatestSession(agent);

  return watchImmediate(
    () => driverConfig.value,
    async (driverConfig) => {
      console.debug("Driver config watch trigger", agent, driverConfig);

      if (contextSizeModifier && driverConfig?.type === "local") {
        // Clone the driver config to prevent reactivity issues.
        driverConfig = clone(driverConfig);

        driverConfig.contextSize = contextSizeModifier(
          driverConfig.contextSize,
        );
      }

      if (driverConfig) {
        if (driverRef.value) {
          console.debug("Comparing driver configs.", agent, {
            other: driverConfig,
          });
          if (!driverRef.value.compareConfig(driverConfig)) {
            console.log(
              "Driver config is different, destroying the driver.",
              agent,
            );
            driverRef.value.destroy();
            driverRef.value = null;
            latestSession.value = null;
          } else {
            console.debug("Driver config is the same.", agent);
            return;
          }
        }

        switch (driverConfig.type) {
          case "local": {
            let driver: TauriLlmDriver | null = null;

            if (latestSession.value?.driver === "local") {
              driver = await TauriLlmDriver.find(
                latestSession.value.id,
                driverConfig,
              );
            }

            if (!driver) {
              console.log("Creating new TauriLlmDriver", agent, driverConfig);

              const initialPrompt = initialPromptBuilder();

              driver = TauriLlmDriver.create(
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
                agent,
                latestSession: latestSession.value,
                driverConfig,
              });
            }

            driverRef.value = driver;
            break;
          }

          case "remote": {
            console.log("Creating new RemoteLlmDriver", {
              agent,
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
