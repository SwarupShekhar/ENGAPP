import "react-native-get-random-values";
import "./src/sentry/init";
import { Platform } from "react-native";
import { registerRootComponent } from "expo";
import App from "./src/App";
import { isSentryEnabled, Sentry } from "./src/sentry/sentry";

// LiveKit is native-only — skip on web to avoid white-screen crashes.
if (Platform.OS !== "web") {
  try {
    const { registerGlobals } = require("@livekit/react-native");
    registerGlobals();
  } catch {
    console.warn(
      "[LiveKit] Native modules not available. Call features disabled.",
    );
  }
}

registerRootComponent(isSentryEnabled ? Sentry.wrap(App) : App);
