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
