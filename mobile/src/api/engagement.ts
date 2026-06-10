import { client } from "./client";

export interface AggregatedReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export const engagementApi = {
  toggleReelLike: (strapiReelId: number) =>
    client
      .post<{ liked: boolean; totalLikes: number }>(
        `/engagement/reels/${strapiReelId}/like`,
      )
      .then((r) => r.data),

  getReelEngagement: (strapiReelId: number) =>
    client
      .get<{ likedByMe: boolean; totalLikes: number }>(
        `/engagement/reels/${strapiReelId}`,
      )
      .then((r) => r.data),

  setMessageReaction: (messageId: string, emoji: string) =>
    client
      .put<AggregatedReaction[]>(`/engagement/messages/${messageId}/reaction`, {
        emoji,
      })
      .then((r) => r.data),

  shareReel: (strapiReelId: number, conversationId: string) =>
    client
      .post(`/engagement/reels/${strapiReelId}/share`, { conversationId })
      .then((r) => r.data),
};
