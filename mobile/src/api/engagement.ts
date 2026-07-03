import { client } from "./client";

export interface AggregatedReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ReelCommentAuthor {
  id: string;
  fname: string;
  profileImage: string | null;
}

export interface ReelComment {
  id: string;
  body: string;
  createdAt: string;
  author: ReelCommentAuthor;
  isMine: boolean;
}

export interface ReelCommentsPage {
  items: ReelComment[];
  nextCursor: string | null;
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
      .get<{ likedByMe: boolean; totalLikes: number; commentCount: number }>(
        `/engagement/reels/${strapiReelId}`,
      )
      .then((r) => r.data),

  getReelComments: (
    strapiReelId: number,
    cursor?: string,
    limit = 20,
  ) =>
    client
      .get<ReelCommentsPage>(`/engagement/reels/${strapiReelId}/comments`, {
        params: { ...(cursor ? { cursor } : {}), limit },
      })
      .then((r) => r.data),

  postReelComment: (strapiReelId: number, body: string) =>
    client
      .post<ReelComment>(`/engagement/reels/${strapiReelId}/comments`, {
        body,
      })
      .then((r) => r.data),

  deleteReelComment: (strapiReelId: number, commentId: string) =>
    client
      .delete<{ deleted: true }>(
        `/engagement/reels/${strapiReelId}/comments/${commentId}`,
      )
      .then((r) => r.data),

  setMessageReaction: (messageId: string, emoji: string) =>
    client
      .put<AggregatedReaction[]>(`/engagement/messages/${messageId}/reaction`, {
        emoji,
      })
      .then((r) => r.data),

  shareReel: (
    strapiReelId: number,
    conversationId: string,
    snapshot?: {
      title?: string;
      thumbnailUrl?: string | null;
      muxPlaybackId?: string;
    },
  ) =>
    client
      .post(`/engagement/reels/${strapiReelId}/share`, {
        conversationId,
        snapshot,
      })
      .then((r) => r.data),
};
