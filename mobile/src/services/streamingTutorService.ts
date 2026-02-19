import { API_URL } from '../api/client';

export interface StreamChunk {
    type: 'sentence' | 'audio' | 'error' | 'timeout';
    text?: string;
    audio?: string; // base64
    message?: string;
}

type StreamCallback = (chunk: StreamChunk) => void;

class StreamingTutorService {
    private ws: WebSocket | null = null;
    private callbacks: StreamCallback[] = [];

    connect(sessionId: string, userId: string) {
        if (this.ws) {
            this.ws.close();
        }

        // Construct WS URL
        // If API_URL is http, use ws. If https, use wss.
        // Also handle port 3000 -> 8000 mapping if on localhost
        let wsUrl = API_URL.replace('http', 'ws');
        
        // For local development, we need to connect to Python service on port 8000
        // If API_URL points to localhost:3000 or local IP:3000, change to :8000
        if (wsUrl.includes(':3000')) {
             wsUrl = wsUrl.replace(':3000', ':8000');
        }
        // For production, we might need a different approach if Python service is separate
        // For now, assume same host but different port for local dev

        this.ws = new WebSocket(`${wsUrl}/ws/${sessionId}?user_id=${userId}`);

        this.ws.onopen = () => {
            console.log('[StreamingTutor] Connected');
        };

        this.ws.onmessage = (event) => {
            try {
                const chunk = JSON.parse(event.data);
                this.notify(chunk);
            } catch (e) {
                console.error('[StreamingTutor] Parse error:', e);
            }
        };

        this.ws.onerror = (e) => {
            console.error('[StreamingTutor] Error:', e);
            this.notify({ type: 'error', message: 'Connection error' });
        };

        this.ws.onclose = (e) => {
            console.log('[StreamingTutor] Closed:', e.reason);
        };
    }

    sendText(text: string) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ text }));
        } else {
            console.warn('[StreamingTutor] WS not open');
        }
    }

    onMessage(cb: StreamCallback) {
        this.callbacks.push(cb);
    }

    offMessage(cb: StreamCallback) {
        this.callbacks = this.callbacks.filter(c => c !== cb);
    }

    private notify(chunk: StreamChunk) {
        this.callbacks.forEach(cb => cb(chunk));
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
