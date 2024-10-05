import { env } from "@/env";
import pRetry from "p-retry";
import Plausible, {
  type EventOptions,
  type PlausibleOptions,
} from "plausible-tracker";

const plausible = env.VITE_PLAUSIBLE_API_HOST
  ? Plausible({
      domain: "client.simularity.ai",
      trackLocalhost: true,
      apiHost: env.VITE_PLAUSIBLE_API_HOST,
    })
  : undefined;

export async function trackPageview(
  path: string,
  eventData?: PlausibleOptions,
  options?: EventOptions,
) {
  try {
    return pRetry(() =>
      plausible?.trackPageview(
        { ...eventData, url: "tauri://localhost" + path },
        options,
      ),
    );
  } catch (e) {
    console.warn("[Plausible] Failed to track pageview", e);
  }
}

export async function trackEvent(
  eventName: string,
  options?: EventOptions,
  eventData?: PlausibleOptions,
) {
  try {
    return pRetry(() => plausible?.trackEvent(eventName, options, eventData));
  } catch (e) {
    console.warn("[Plausible] Failed to track event", e);
  }
}
