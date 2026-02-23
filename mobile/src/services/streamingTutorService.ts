import { API_URL } from "../api/client";

export interface StreamChunk {
  type: "sentence" | "audio" | "error" | "timeout" | "transcription";
  text?: string;
  audio?: string; // base64
  message?: string;
  is_final?: boolean;
  assessmentResult?: any;
}

type StreamCallback = (chunk: StreamChunk) => void;

class StreamingTutorService {
  private ws: WebSocket | null = null;
  private callbacks: StreamCallback[] = [];

  connect(sessionId: string, userId: string) {
    if (this.ws) {
      this.ws.close();
    }

    let wsUrl = API_URL.replace("http", "ws");

    if (wsUrl.includes(":3000")) {
      wsUrl = wsUrl.replace(":3000", ":8001");
    }

    this.ws = new WebSocket(
      `${wsUrl}/api/tutor/ws/${sessionId}?user_id=${userId}`,
    );

    this.ws.onopen = () => {
      console.log("[StreamingTutor] Connected");
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
      console.log("[StreamingTutor] Closed:", e.reason);
    };
  }

  sendText(text: string | null, phoneticContext?: any, audioBase64?: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload: any = {};
      if (text) payload.text = text;
      if (phoneticContext) payload.phonetic_context = phoneticContext;
      if (audioBase64) payload.audio_base64 = audioBase64;

      this.ws.send(JSON.stringify(payload));
    } else {
      console.warn("[StreamingTutor] WS not open");
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks = [];
  }
}

export const streamingTutor = new StreamingTutorService();
