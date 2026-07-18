import { API_URL as NEST_API_URL } from "../../../api/client";
import { API_URL as ENGLIVO_API_URL } from "../../../api/englivoClient";
import { readExpoExtra } from "../../../api/expoExtra";
import { tutorApi } from "../../../api/tutor";

/** Vultr host port for backend-ai (docker-compose.prod.yml). Dev / emergency only. */
const VULTR_AI_HOST_PORT = "4010";

/**
 * Public Maya WS origin for production.
 * Caddy strips `/ai` and proxies `/api/tutor/ws/*` → backend-ai (see config/caddy/Caddyfile).
 * Prefer wss via api.englivo.com — never plaintext ws:// to a raw IP (Android cleartext
 * policies kill that on release builds and it looks like "Maya doesn't work").
 */
const PUBLIC_AI_WS_ORIGIN = "wss://api.englivo.com/ai";

/** Emergency plaintext IP path — only when explicitly overridden (never the default). */
const LEGACY_PLAINTEXT_AI_WS = `ws://139.84.163.249:${VULTR_AI_HOST_PORT}`;

function normalizeTutorWsUrl(url: string): string {
  return url.replace(/\/$/, "");
}

/** Structured hop log for Section D repro (shows in release logcat / Metro). */
export function mayaHop(
  hop: string,
  detail?: Record<string, unknown>,
): void {
  const payload = detail ? ` ${JSON.stringify(detail)}` : "";
  console.log(`[MAYA-HOP] ${hop}${payload}`);
}

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
    void this.connect(sessionId, userId);
  }

  connect(sessionId: string, userId: string) {
    void this.openConnection(sessionId, userId);
  }

  private async openConnection(sessionId: string, userId: string) {
    if (this.ws) {
      this.ws.close();
    }
    this.pendingSends = [];
    const IS_PROD = !__DEV__;
    let wsUrl: string;

    // Explicit override wins (ENGLIVO_WS_URL_OVERRIDE in .env → app.config extra).
    // Use only for local debugging — do not bake plaintext IP into release builds.
    const wsOverride = (readExpoExtra("englivoWsUrlOverride") ?? "").trim();
    if (wsOverride) {
      wsUrl = normalizeTutorWsUrl(wsOverride);
      mayaHop("ws_url_override", { wsUrl });
    } else if (IS_PROD) {
      const nestBase = NEST_API_URL.replace(/\/$/, "");
      try {
        const u = new URL(
          nestBase.startsWith("http") ? nestBase : `http://${nestBase}`,
        );
        if (u.hostname === "api.englivo.com") {
          wsUrl = PUBLIC_AI_WS_ORIGIN;
        } else {
          const wsScheme = u.protocol === "https:" ? "wss" : "ws";
          // Non-prod custom host: prefer same-host AI path under /ai when HTTPS.
          wsUrl =
            wsScheme === "wss"
              ? normalizeTutorWsUrl(`${wsScheme}://${u.hostname}/ai`)
              : normalizeTutorWsUrl(
                  `${wsScheme}://${u.hostname}:${VULTR_AI_HOST_PORT}`,
                );
        }
      } catch {
        const base = ENGLIVO_API_URL.replace(/\/$/, "");
        wsUrl = base.startsWith("https://")
          ? PUBLIC_AI_WS_ORIGIN
          : base.replace("https://", "wss://").replace("http://", "ws://");
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

    mayaHop("ws_token_request", { sessionId });
    let wsToken = "";
    try {
      const { token } = await tutorApi.getStreamingWsToken(sessionId);
      wsToken = token;
      mayaHop("ws_token_ok", { hasToken: Boolean(token) });
    } catch (e) {
      mayaHop("ws_token_fail", {
        error: e instanceof Error ? e.message : String(e),
      });
      console.warn("[StreamingTutor] WS token fetch failed:", e);
    }

    const qs = new URLSearchParams({ user_id: userId });
    if (wsToken) qs.set("ws_token", wsToken);
    const fullWs = `${wsUrl}/api/tutor/ws/${sessionId}?${qs.toString()}`;
    mayaHop("ws_connect", {
      origin: wsUrl,
      plaintext: wsUrl.startsWith("ws://"),
      legacyIp: wsUrl.includes("139.84.163.249"),
    });
    if (wsUrl === LEGACY_PLAINTEXT_AI_WS || wsUrl.startsWith("ws://")) {
      console.warn(
        "[StreamingTutor] Using plaintext ws:// — release Android may block this. Prefer wss://api.englivo.com/ai",
      );
    }
    this.ws = new WebSocket(fullWs);

    this.ws.onopen = () => {
      mayaHop("ws_open");
      this.flushPendingSends();
    };

    this.ws.onmessage = (event) => {
      try {
        const chunk = JSON.parse(event.data);
        if (
          chunk?.type === "transcript" ||
          chunk?.type === "transcription" ||
          chunk?.type === "sentence" ||
          chunk?.type === "audio" ||
          chunk?.type === "error" ||
          chunk?.type === "done"
        ) {
          mayaHop(`ws_chunk_${chunk.type}`, {
            hasText: Boolean(chunk.text),
            hasAudio: Boolean(chunk.audio),
          });
        }
        this.notify(chunk);
      } catch (e) {
        console.error("[StreamingTutor] Parse error:", e);
      }
    };

    this.ws.onerror = (e) => {
      mayaHop("ws_error");
      console.error("[StreamingTutor] Error:", e);
      this.notify({ type: "error", message: "Connection error" });
    };

    this.ws.onclose = (e) => {
      mayaHop("ws_close", { code: e.code, reason: e.reason || "" });
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

    mayaHop("ws_send", {
      hasText: Boolean(text),
      hasAudio: Boolean(audioBase64),
      audioChars: audioBase64?.length ?? 0,
    });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
      return;
    }

    if (this.pendingSends.length >= MAX_PENDING_SENDS) {
      this.pendingSends.shift();
    }
    this.pendingSends.push(raw);
    mayaHop("ws_send_queued", { queueLen: this.pendingSends.length });
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

  /**
   * Wait until the socket delivers a meaningful chunk or times out.
   * Used before falling back to blocking process-speech over HTTPS.
   */
  waitForMeaningfulChunk(
    timeoutMs: number,
    isDone: () => boolean,
  ): Promise<boolean> {
    if (isDone()) return Promise.resolve(true);

    return new Promise((resolve) => {
      const handler: StreamCallback = (chunk) => {
        const meaningful =
          ((chunk.type === "transcript" || chunk.type === "transcription") &&
            Boolean(chunk.text)) ||
          (chunk.type === "sentence" && Boolean(chunk.text)) ||
          (chunk.type === "audio" && Boolean(chunk.audio)) ||
          chunk.type === "error";
        if (meaningful) {
          clearTimeout(timer);
          this.offMessage(handler);
          resolve(true);
        }
      };

      const timer = setTimeout(() => {
        this.offMessage(handler);
        resolve(isDone());
      }, timeoutMs);

      this.onMessage(handler);
    });
  }
}

export const streamingTutor = new StreamingTutorService();
