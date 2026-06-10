export interface AggregatedReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export function aggregateReactions(
  rows: { emoji: string; userId: string }[],
): AggregatedReaction[] {
  const byEmoji = new Map<string, string[]>();
  for (const row of rows) {
    const userIds = byEmoji.get(row.emoji) ?? [];
    userIds.push(row.userId);
    byEmoji.set(row.emoji, userIds);
  }

  return Array.from(byEmoji.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}
