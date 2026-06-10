/** User-facing copy when backend-ai / Gemini rate-limits tutor turns. */
export const MAYA_RATE_LIMIT_MESSAGE =
  "Maya is getting a lot of requests right now. Wait about a minute, then hold the mic to try again.";

export function isRateLimitError(err: unknown): boolean {
  if (err == null) return false;
  const anyErr = err as {
    status?: number;
    response?: { status?: number };
    message?: string;
  };
  const status = anyErr.response?.status ?? anyErr.status;
  if (status === 429) return true;
  const msg = String(anyErr.message ?? err);
  return /\b429\b/.test(msg) || /rate\s*limit/i.test(msg);
}

export function tutorErrorMessage(
  err: unknown,
  fallback: string,
): string {
  return isRateLimitError(err) ? MAYA_RATE_LIMIT_MESSAGE : fallback;
}
