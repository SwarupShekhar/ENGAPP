import Constants from "expo-constants";
import { API_URL as NEST_API_URL } from "../../../api/client";
import { API_URL as ENGLIVO_API_URL } from "../../../api/englivoClient";
import { readExpoExtra } from "../../../api/expoExtra";

/** Vultr backend-ai WebSocket port (not exposed on api.englivo.com — only Nest is behind Caddy). */
const VULTR_AI_WS_ORIGIN = "wss://139.84.163.249:4002";

export interface StreamChunk {
  type:
    | "sentence"
    | "audio"
    | "error"
    | "timeout"
    | "transcription"
    | "transcript"
    | "phonetic_ready"
    | "coaching_hint"
    | "done";
  text?: string;
  audio?: string; // base64
  message?: string;
  is_final?: boolean;
  assessmentResult?: any;
  timings?: { trace_id?: string; ms?: Record<string, number> };
  /** Populated when type === "coaching_hint" */
  trigger?: string;
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

  isConnected(): boolean {
    return (
      this.ws != null &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    );
  }

  /** Open WS only when needed (e.g. SSE fallback). Preserves registered onMessage handlers. */
  ensureConnected(sessionId: string, userId: string) {
    if (this.isConnected()) return;
    this.connect(sessionId, userId);
  }

  connect(sessionId: string, userId: string) {
    if (this.ws) {
      this.ws.close();
    }
    this.pendingSends = [];
    const IS_PROD = !__DEV__;
    let wsUrl: string;

    // Explicit override wins (ENGLIVO_WS_URL_OVERRIDE in .env → app.config extra)
    const wsOverride = (readExpoExtra("englivoWsUrlOverride") ?? "").trim();
    if (wsOverride) {
      wsUrl = wsOverride;
    } else if (IS_PROD) {
      const nestBase = NEST_API_URL.replace(/\/$/, "");
      try {
        const u = new URL(nestBase.startsWith("http") ? nestBase : `http://${nestBase}`);
        const wsScheme = u.protocol === "https:" ? "wss" : "ws";
        // api.englivo.com only reverse-proxies Nest; backend-ai WS stays on Vultr :4002.
        if (u.hostname === "api.englivo.com") {
          wsUrl = VULTR_AI_WS_ORIGIN;
        } else {
          wsUrl = `${wsScheme}://${u.hostname}:4002`;
        }
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

    const fullWs = `${wsUrl}/api/tutor/ws/${sessionId}?user_id=${userId}`;
    if (__DEV__) {
      console.log("[StreamingTutor] Connecting", fullWs);
    } else {
      console.log(`[EngR] Tutor WS fallback: ${wsUrl}`);
    }
    this.ws = new WebSocket(fullWs);

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
    cefrLevel?: string | null,
  ) {
    const payload: Record<string, unknown> = {};
    if (text) payload.text = text;
    if (phoneticContext) payload.phonetic_context = phoneticContext;
    if (audioBase64) payload.audio_base64 = audioBase64;
    if (traceId) payload.trace_id = traceId;
    if (cefrLevel) payload.cefr_level = cefrLevel;
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
