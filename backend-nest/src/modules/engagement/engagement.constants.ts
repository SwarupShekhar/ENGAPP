/** Quick reactions (long-press bar) + emoji picker sheet — keep in sync with mobile. */
export const ALLOWED_MESSAGE_REACTION_EMOJIS = new Set([
  '❤️',
  '😂',
  '😮',
  '😢',
  '😡',
  '👍',
  '😀',
  '🥰',
  '😍',
  '😊',
  '😉',
  '😭',
  '👏',
  '🙏',
  '🔥',
  '💯',
  '✨',
  '🎉',
  '👋',
  '🤔',
  '🙌',
  '💪',
  '📚',
  '🗣️',
]);

export function assertAllowedReactionEmoji(emoji: unknown): string {
  if (typeof emoji !== 'string' || !emoji.trim()) {
    throw new Error('INVALID_EMOJI');
  }
  const trimmed = emoji.trim();
  if (trimmed.length > 16 || !ALLOWED_MESSAGE_REACTION_EMOJIS.has(trimmed)) {
    throw new Error('INVALID_EMOJI');
  }
  return trimmed;
}

export const MAX_REEL_COMMENT_LENGTH = 500;
export const DEFAULT_REEL_COMMENTS_PAGE_SIZE = 20;

export function assertReelCommentBody(body: unknown): string {
  if (typeof body !== 'string') {
    throw new Error('INVALID_BODY');
  }
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error('INVALID_BODY');
  }
  if (trimmed.length > MAX_REEL_COMMENT_LENGTH) {
    throw new Error('BODY_TOO_LONG');
  }
  return trimmed;
}

export function assertConversationId(conversationId: unknown): string {
  if (typeof conversationId !== 'string' || !conversationId.trim()) {
    throw new Error('INVALID_CONVERSATION');
  }
  const trimmed = conversationId.trim();
  if (trimmed.length > 64) {
    throw new Error('INVALID_CONVERSATION');
  }
  return trimmed;
}
