import { client } from './client';

/**
 * API client for friendship/connection endpoints.
 */
export const connectionsApi = {
    /**
     * Send a friend request to another user.
     */
    sendRequest: (targetUserId: string) =>
        client.post('/friendship/request', { targetUserId }).then(r => r.data),

    /**
     * Accept a pending friend request.
     */
    acceptRequest: (requestId: string) =>
        client.patch(`/friendship/${requestId}/accept`).then(r => r.data),

    /**
     * Reject a pending friend request.
     */
    rejectRequest: (requestId: string) =>
        client.patch(`/friendship/${requestId}/reject`).then(r => r.data),

    /**
     * Get connection status with another user.
     * Returns: { status, requestId?, conversationId? }
     */
    getStatus: (targetUserId: string) =>
        client.get(`/friendship/status/${targetUserId}`).then(r => r.data),

    /**
     * Get all friends.
     */
    getFriends: () =>
        client.get('/friendship/friends').then(r => r.data),

    /**
     * Get pending incoming friend requests.
     */
    getPendingRequests: () =>
        client.get('/friendship/pending').then(r => r.data),
};

/**
 * API client for chat REST endpoints.
 */
export const chatApi = {
    /**
     * Get all conversations for the current user.
     */
    getConversations: () =>
        client.get('/chat/conversations').then(r => r.data),

    /**
     * Get messages for a conversation (paginated).
     */
    getMessages: (conversationId: string, limit = 30, before?: string) =>
        client.get(`/chat/conversations/${conversationId}/messages`, {
            params: { limit, before },
        }).then(r => r.data),

    /**
     * Get total unread message count.
     */
    getUnreadCount: () =>
        client.get('/chat/unread-count').then(r => r.data),

    /**
     * Mark all messages in a conversation as read.
     */
    markAsRead: (conversationId: string) =>
        client.post(`/chat/conversations/${conversationId}/read`).then(r => r.data),
};
