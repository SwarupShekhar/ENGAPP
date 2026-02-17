import { io, Socket } from 'socket.io-client';
import { API_URL } from '../api/client';

type SocketCallback = (...args: any[]) => void;

class SocketService {
    private static instance: SocketService;
    private socket: Socket | null = null;
    private listeners = new Map<string, Set<SocketCallback>>();

    static getInstance(): SocketService {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }

    /**
     * Connect to the chat namespace with Clerk auth.
     */
    connect(token: string) {
        if (this.socket?.connected) return;

        this.socket = io(`${API_URL}/chat`, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity,
        });

        this.socket.on('connect', () => {
            console.log('[Socket] Connected:', this.socket?.id);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
        });

        this.socket.on('connect_error', (err) => {
            console.warn('[Socket] Connection error:', err.message);
        });

        // Re-register existing listeners on reconnect
        this.socket.on('connect', () => {
            this.listeners.forEach((callbacks, event) => {
                callbacks.forEach(cb => {
                    this.socket?.on(event, cb);
                });
            });
        });
    }

    disconnect() {
        this.socket?.disconnect();
        this.socket = null;
        this.listeners.clear();
    }

    isConnected(): boolean {
        return this.socket?.connected ?? false;
    }

    // ── Emitters ────────────────────────────────────────

    joinConversation(conversationId: string) {
        this.socket?.emit('join_conversation', { conversationId });
    }

    sendMessage(
        conversationId: string,
        content: string,
        type: string = 'text',
        metadata?: any,
    ) {
        this.socket?.emit('send_message', {
            conversationId,
            content,
            type,
            metadata,
        });
    }

    sendTypingStart(conversationId: string) {
        this.socket?.emit('typing_start', { conversationId });
    }

    sendTypingStop(conversationId: string) {
        this.socket?.emit('typing_stop', { conversationId });
    }

    markRead(conversationId: string) {
        this.socket?.emit('mark_read', { conversationId });
    }

    sendCallInvite(
        conversationId: string,
        callId: string,
        callType: 'voice' | 'video' = 'voice',
    ) {
        this.socket?.emit('send_call_invite', {
            conversationId,
            callId,
            callType,
        });
    }

    // ── Listeners ───────────────────────────────────────

    on(event: string, callback: SocketCallback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
        this.socket?.on(event, callback);
    }

    off(event: string, callback: SocketCallback) {
        this.listeners.get(event)?.delete(callback);
        this.socket?.off(event, callback);
    }

    onNewMessage(callback: SocketCallback) { this.on('new_message', callback); }
    offNewMessage(callback: SocketCallback) { this.off('new_message', callback); }

    onUserTyping(callback: SocketCallback) { this.on('user_typing', callback); }
    offUserTyping(callback: SocketCallback) { this.off('user_typing', callback); }

    onMessagesRead(callback: SocketCallback) { this.on('messages_read', callback); }
    offMessagesRead(callback: SocketCallback) { this.off('messages_read', callback); }

    onPresenceUpdate(callback: SocketCallback) { this.on('presence_update', callback); }
    offPresenceUpdate(callback: SocketCallback) { this.off('presence_update', callback); }

    onIncomingCall(callback: SocketCallback) { this.on('incoming_call', callback); }
    offIncomingCall(callback: SocketCallback) { this.off('incoming_call', callback); }
}

export default SocketService;
