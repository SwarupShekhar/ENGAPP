import Constants from "expo-constants";

/**
 * Read `extra.<key>` from the embedded Expo manifest. Some clients expose fields on
 * `Constants.manifest` but not `Constants.expoConfig` (same pattern as Clerk in App.tsx).
 */
export function readExpoExtra(key: string): string | undefined {
  const ec = Constants.expoConfig as { extra?: Record<string, unknown> } | null;
  const manifest = Constants.manifest as { extra?: Record<string, unknown> } | null;
  const v = ec?.extra?.[key] ?? manifest?.extra?.[key];
  return typeof v === "string" ? v : undefined;
}
