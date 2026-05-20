import Constants from "expo-constants";
import { API_URL as NEST_API_URL } from "../../../api/client";
import { API_URL as ENGLIVO_API_URL } from "../../../api/englivoClient";

export interface StreamChunk {
  type:
    | "sentence"
    | "audio"
    | "error"
    | "timeout"
    | "transcription"
    | "transcript"
    | "phonetic_ready"
    | "done";
  text?: string;
  audio?: string; // base64
  message?: string;
  is_final?: boolean;
  assessmentResult?: any;
  timings?: { trace_id?: string; ms?: Record<string, number> };
}

type StreamCallback = (chunk: StreamChunk) => void;

const MAX_PENDING_SENDS = 32;

class StreamingTutorService {
  private ws: WebSocket | null = null;
  private callbacks: StreamCallback[] = [];
  /** JSON payloads waiting until the socket is OPEN (fixes race: send before onopen). */
  private pendingSends: string[] = [];

  private flushPendingSends() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.pendingSends.length > 0) {
      const raw = this.pendingSends.shift();
      if (raw) this.ws.send(raw);
    }
  }

  connect(sessionId: string, userId: string) {
    if (this.ws) {
      this.ws.close();
    }
    this.pendingSends = [];
    this.callbacks = [];
    const IS_PROD = !__DEV__;
    let wsUrl: string;

    // Explicit override wins (set via ENGLIVO_WS_URL_OVERRIDE in .env.local for internal builds)
    const wsOverride = ((Constants.expoConfig as any)?.extra?.englivoWsUrlOverride as string | undefined)?.trim();
    if (wsOverride) {
      wsUrl = wsOverride;
    } else if (IS_PROD) {
      // REST may hit Nest (:4001); tutor WebSocket is on backend-ai (:4002 on Vultr).
      const nestBase = NEST_API_URL.replace(/\/$/, "");
      try {
        const u = new URL(nestBase.startsWith("http") ? nestBase : `http://${nestBase}`);
        const wsScheme = u.protocol === "https:" ? "wss" : "ws";
        wsUrl = `${wsScheme}://${u.hostname}:4002`;
      } catch {
        const base = ENGLIVO_API_URL.replace(/\/$/, "");
        wsUrl = base.startsWith("https://")
          ? base.replace("https://", "wss://")
          : base.replace("http://", "ws://");
      }
    } else {
      // Dev: derive from API_URL host, backend-ai on 8001
      try {
        const base = NEST_API_URL.replace(/\/$/, "");
        const u = new URL(base.startsWith("http") ? base : `http://${base}`);
        const host = u.hostname;
        const wsScheme = u.protocol === "https:" ? "wss" : "ws";
        wsUrl = `${wsScheme}://${host}:8001`;
      } catch {
        wsUrl = NEST_API_URL.replace("http", "ws").replace(":3000", ":8001");
      }
    }

    this.ws = new WebSocket(
      `${wsUrl}/api/tutor/ws/${sessionId}?user_id=${userId}`,
    );

    this.ws.onopen = () => {
      if (__DEV__) console.log("[StreamingTutor] Connected");
      this.flushPendingSends();
    };

    this.ws.onmessage = (event) => {
      try {
        const chunk = JSON.parse(event.data);
        this.notify(chunk);
      } catch (e) {
        console.error("[StreamingTutor] Parse error:", e);
      }
    };

    this.ws.onerror = (e) => {
      console.error("[StreamingTutor] Error:", e);
      this.notify({ type: "error", message: "Connection error" });
    };

    this.ws.onclose = (e) => {
      if (__DEV__) console.log("[StreamingTutor] Closed:", e.reason);
    };
  }

  sendText(
    text: string | null,
    phoneticContext?: any,
    audioBase64?: string,
    traceId?: string,
  ) {
    const payload: Record<string, unknown> = {};
    if (text) payload.text = text;
    if (phoneticContext) payload.phonetic_context = phoneticContext;
    if (audioBase64) payload.audio_base64 = audioBase64;
    if (traceId) payload.trace_id = traceId;
    const raw = JSON.stringify(payload);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
      return;
    }

    if (this.pendingSends.length >= MAX_PENDING_SENDS) {
      this.pendingSends.shift();
    }
    this.pendingSends.push(raw);
    if (__DEV__) {
      console.warn(
        "[StreamingTutor] WS not open — queued send (will flush on connect)",
        { queueLen: this.pendingSends.length },
      );
    }
  }

  onMessage(cb: StreamCallback) {
    this.callbacks.push(cb);
  }

  offMessage(cb: StreamCallback) {
    this.callbacks = this.callbacks.filter((c) => c !== cb);
  }

  private notify(chunk: StreamChunk) {
    this.callbacks.forEach((cb) => cb(chunk));
  }

  disconnect() {
    this.pendingSends = [];
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks = [];
  }
}

export const streamingTutor = new StreamingTutorService();
