import { useEffect } from "react";
import { useUser } from "@clerk/clerk-expo";
import { isSentryEnabled, setSentryUser } from "./sentry";

/** Attach Clerk user to Sentry events (same id as PostHog + backend logs). */
export function SentryUserSync() {
  const { user, isSignedIn } = useUser();

  useEffect(() => {
    if (!isSentryEnabled) return;

    if (isSignedIn && user?.id) {
      setSentryUser(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        username: user.fullName ?? undefined,
      });
    } else {
      setSentryUser(null);
    }
  }, [
    isSignedIn,
    user?.id,
    user?.primaryEmailAddress?.emailAddress,
    user?.fullName,
  ]);

  return null;
}
