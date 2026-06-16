import { Sentry } from "./init";
import { isSentryEnabled } from "./sentryConfig";

export { Sentry, isSentryEnabled };

export function captureSentryException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!isSentryEnabled) return;
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext("extra", context);
    }
    Sentry.captureException(error);
  });
}

export function setSentryUser(
  userId: string | null | undefined,
  traits?: { email?: string; username?: string },
): void {
  if (!isSentryEnabled) return;
  if (!userId?.trim()) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: userId,
    email: traits?.email,
    username: traits?.username,
  });
}
