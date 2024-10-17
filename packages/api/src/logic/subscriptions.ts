import { SubscriptionTier } from "@/lib/schema";
import { unreachable } from "@/lib/utils";

/**
 * Check if the user's subscription is enough for the required tier.
 */
export function subscriptionEnough(
  active: SubscriptionTier,
  required?: SubscriptionTier | null,
): boolean {
  if (!required) return true;

  switch (required) {
    case "basic":
      return active === "basic" || active === "premium";
    case "premium":
      return active === "premium";
    default:
      throw unreachable(required);
  }
}
