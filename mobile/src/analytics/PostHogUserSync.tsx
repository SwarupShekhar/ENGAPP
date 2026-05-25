import { useEffect } from "react";
import { useUser } from "@clerk/clerk-expo";
import { isPostHogEnabled } from "./posthogConfig";
import { useAnalytics } from "./useAnalytics";

/** Links Clerk user id to PostHog person (must render inside Clerk + analytics providers). */
export function PostHogUserSync() {
  const analytics = useAnalytics();
  const { user, isSignedIn } = useUser();

  useEffect(() => {
    if (!isPostHogEnabled) return;

    if (isSignedIn && user?.id) {
      const traits: Record<string, string> = {};
      const email = user.primaryEmailAddress?.emailAddress;
      if (email) traits.email = email;
      if (user.fullName) traits.name = user.fullName;
      analytics.identify(user.id, traits);
    } else {
      analytics.reset();
    }
  }, [
    analytics,
    isSignedIn,
    user?.id,
    user?.primaryEmailAddress?.emailAddress,
    user?.fullName,
  ]);

  return null;
}
