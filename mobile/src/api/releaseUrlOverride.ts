/**
 * EAS env APP_API_URL_* can accidentally point release builds at a dev machine.
 * In release, ignore private/LAN URLs so hosted defaults in client.ts apply.
 */
function looksLikeNonPublicHost(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "10.0.2.2") return true;
    if (h.startsWith("192.168.")) return true;
    if (h.startsWith("10.")) return true;
    const m = /^172\.(\d+)\./.exec(h);
    if (m) {
      const n = Number(m[1]);
      if (n >= 16 && n <= 31) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function isNonPublicUrl(url: string): boolean {
  return looksLikeNonPublicHost(url);
}

/**
 * In dev, stale LAN overrides (e.g. old hotspot IP) cause hard network failures.
 * If a private-host override is present and Metro exposes the current host IP,
 * rewrite the override hostname to the Metro host while preserving scheme/port/path.
 */
export function rewriteDevLanOverride(
  raw: string | null | undefined,
  devHost: string | undefined,
  label: string,
): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  if (!__DEV__) return v;
  if (!devHost) return v;
  if (!looksLikeNonPublicHost(v)) return v;

  try {
    const u = new URL(v);
    if (u.hostname === devHost) return v;
    const before = u.hostname;
    u.hostname = devHost;
    const rewritten = u.toString().replace(/\/$/, "");
    console.warn(
      `[${label}] Rewriting dev LAN override host ${before} -> ${devHost} (${rewritten})`,
    );
    return rewritten;
  } catch {
    return v;
  }
}

/** Use extra.* URL from app config only if valid for this build profile. */
export function coerceReleaseApiOverride(
  raw: unknown,
  label: string,
): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  if (__DEV__) return v;
  if (looksLikeNonPublicHost(v)) {
    console.warn(
      `[${label}] Ignoring LAN/localhost URL override in release build (${v}). ` +
        `Remove APP_API_URL_OVERRIDE / APP_* from EAS env for hosted backends, or use a public HTTPS URL.`,
    );
    return null;
  }
  return v;
}
