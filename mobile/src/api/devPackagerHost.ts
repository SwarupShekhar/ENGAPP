import { NativeModules } from "react-native";

/**
 * Hostname of the Metro bundle URL (`SourceCode.scriptURL`). In dev this matches the machine
 * the device actually loaded JS from, so it tracks hotspot / Wi‑Fi changes more reliably than
 * `Constants.expoConfig.hostUri`, which can stay on an old LAN IP until a full reconnect.
 */
export function getDevBundleHostname(): string | undefined {
  if (!__DEV__) return undefined;
  try {
    const url = (NativeModules as { SourceCode?: { scriptURL?: string } })?.SourceCode
      ?.scriptURL;
    if (!url || url.startsWith("file:")) return undefined;
    if (!url.startsWith("http://") && !url.startsWith("https://")) return undefined;
    const hostname = new URL(url).hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "10.0.2.2"
    ) {
      return undefined;
    }
    return hostname;
  } catch {
    return undefined;
  }
}
