import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { ChatGateway } from '../chat/chat.gateway';
import { ReelsService } from '../reels/reels.service';
import {
  aggregateReactions,
  AggregatedReaction,
} from '../../common/aggregate-reactions';
import {
  assertAllowedReactionEmoji,
  assertConversationId,
  assertReelCommentBody,
  DEFAULT_REEL_COMMENTS_PAGE_SIZE,
  MAX_REEL_COMMENT_LENGTH,
} from './engagement.constants';

export type { AggregatedReaction };

export type ReelCommentAuthor = {
  id: string;
  fname: string;
  profileImage: string | null;
};

export type ReelCommentDto = {
  id: string;
  body: string;
  createdAt: Date;
  author: ReelCommentAuthor;
  isMine: boolean;
};

export type ReelCommentsPage = {
  items: ReelCommentDto[];
  nextCursor: string | null;
};

@Injectable()
export class EngagementService {
  private readonly logger = new Logger(EngagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly reelsService: ReelsService,
  ) {}

  async toggleReelLike(userId: string, strapiReelId: number) {
    const existing = await this.prisma.reelLike.findUnique({
      where: {
        userId_strapiReelId: { userId, strapiReelId },
      },
    });

    let liked: boolean;
    if (existing) {
      await this.prisma.reelLike.delete({
        where: { id: existing.id },
      });
      liked = false;
    } else {
      await this.prisma.reelLike.create({
        data: { userId, strapiReelId },
      });
      liked = true;
    }

    const totalLikes = await this.prisma.reelLike.count({
      where: { strapiReelId },
    });

    return { liked, totalLikes };
  }

  async getReelEngagement(userId: string, strapiReelId: number) {
    const [existingLike, totalLikes, commentCount] = await Promise.all([
      this.prisma.reelLike.findUnique({
        where: {
          userId_strapiReelId: { userId, strapiReelId },
        },
      }),
      this.prisma.reelLike.count({ where: { strapiReelId } }),
      this.prisma.reelComment.count({
        where: {
          strapiReelId,
          deletedAt: null,
          parentId: null,
        },
      }),
    ]);

    return {
      likedByMe: !!existingLike,
      totalLikes,
      commentCount,
    };
  }

  async getReelComments(
    userId: string,
    strapiReelId: number,
    cursor?: string,
    limit = DEFAULT_REEL_COMMENTS_PAGE_SIZE,
  ): Promise<ReelCommentsPage> {
    const pageSize = Math.min(Math.max(limit, 1), 50);
    const cursorDate = cursor ? this.cursorDateFromComposite(cursor) : null;
    const cursorId = cursor ? this.cursorIdFromComposite(cursor) : null;

    const rows = await this.prisma.reelComment.findMany({
      where: {
        strapiReelId,
        deletedAt: null,
        parentId: null,
        ...(cursorDate && cursorId
          ? {
              OR: [
                { createdAt: { gt: cursorDate } },
                { createdAt: cursorDate, id: { gt: cursorId } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: pageSize + 1,
      include: {
        user: {
          select: {
            id: true,
            fname: true,
            profile: { select: { avatarUrl: true } },
          },
        },
      },
    });

    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? this.toCommentCursor(last.createdAt, last.id)
        : null;

    return {
      items: page.map((row) => this.formatReelComment(row, userId)),
      nextCursor,
    };
  }

  async createReelComment(
    userId: string,
    strapiReelId: number,
    body: string,
  ): Promise<ReelCommentDto> {
    let normalizedBody: string;
    try {
      normalizedBody = assertReelCommentBody(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'INVALID_BODY';
      if (message === 'BODY_TOO_LONG') {
        throw new BadRequestException(
          `Comment must be at most ${MAX_REEL_COMMENT_LENGTH} characters`,
        );
      }
      throw new BadRequestException('Comment cannot be empty');
    }

    const created = await this.prisma.reelComment.create({
      data: {
        userId,
        strapiReelId,
        body: normalizedBody,
      },
      include: {
        user: {
          select: {
            id: true,
            fname: true,
            profile: { select: { avatarUrl: true } },
          },
        },
      },
    });

    return this.formatReelComment(created, userId);
  }

  async deleteReelComment(
    userId: string,
    strapiReelId: number,
    commentId: string,
  ): Promise<{ deleted: true }> {
    const comment = await this.prisma.reelComment.findFirst({
      where: { id: commentId, strapiReelId, deletedAt: null },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    await this.prisma.reelComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    return { deleted: true };
  }

  private formatReelComment(
    row: {
      id: string;
      body: string;
      createdAt: Date;
      userId: string;
      user: {
        id: string;
        fname: string;
        profile: { avatarUrl: string | null } | null;
      };
    },
    viewerUserId: string,
  ): ReelCommentDto {
    return {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      author: {
        id: row.user.id,
        fname: row.user.fname,
        profileImage: row.user.profile?.avatarUrl ?? null,
      },
      isMine: row.userId === viewerUserId,
    };
  }

  /** Cursor encodes ISO timestamp + id for stable ascending pagination. */
  private toCommentCursor(createdAt: Date, id: string): string {
    return `${createdAt.toISOString()}|${id}`;
  }

  private cursorIdFromComposite(cursor: string): string | null {
    const sep = cursor.indexOf('|');
    if (sep === -1) return null;
    return cursor.slice(sep + 1) || null;
  }

  private cursorDateFromComposite(cursor: string): Date | null {
    const sep = cursor.indexOf('|');
    const raw = sep === -1 ? cursor : cursor.slice(0, sep);
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  async setMessageReaction(userId: string, messageId: string, emoji: string) {
    let normalizedEmoji: string;
    try {
      normalizedEmoji = assertAllowedReactionEmoji(emoji);
    } catch {
      throw new BadRequestException('Invalid reaction emoji');
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    await this.assertConversationParticipant(
      message.conversationId,
      userId,
    );

    const existing = await this.prisma.messageReaction.findUnique({
      where: {
        messageId_userId: { messageId, userId },
      },
    });

    if (existing?.emoji === normalizedEmoji) {
      await this.prisma.messageReaction.delete({
        where: { id: existing.id },
      });
    } else if (existing) {
      await this.prisma.messageReaction.update({
        where: { id: existing.id },
        data: { emoji: normalizedEmoji },
      });
    } else {
      await this.prisma.messageReaction.create({
        data: { messageId, userId, emoji: normalizedEmoji },
      });
    }

    const reactions = await this.loadAggregatedReactions(messageId);

    this.chatGateway.emitReactionUpdated(message.conversationId, {
      messageId,
      reactions,
    });

    return reactions;
  }

  async shareReel(
    userId: string,
    strapiReelId: number,
    conversationId: string,
    snapshot?: {
      title?: string;
      thumbnailUrl?: string | null;
      muxPlaybackId?: string;
    },
  ) {
    let normalizedConversationId: string;
    try {
      normalizedConversationId = assertConversationId(conversationId);
    } catch {
      throw new BadRequestException('Invalid conversationId');
    }

    await this.assertConversationParticipant(
      normalizedConversationId,
      userId,
    );

    let reel: {
      id: number;
      title: string;
      muxPlaybackId?: string;
      difficulty_level?: string;
    };
    try {
      reel = await this.reelsService.getReelById(strapiReelId);
    } catch (err) {
      if (!snapshot?.title?.trim()) {
        throw err;
      }
      reel = {
        id: strapiReelId,
        title: snapshot.title.trim(),
        muxPlaybackId: snapshot.muxPlaybackId,
      };
    }

    const thumbnailUrl =
      snapshot?.thumbnailUrl ??
      (reel.muxPlaybackId
        ? `https://image.mux.com/${reel.muxPlaybackId}/thumbnail.jpg`
        : null);

    const metadata = {
      strapiReelId,
      title: reel.title,
      thumbnailUrl,
      ...(reel.difficulty_level && { difficulty: reel.difficulty_level }),
      snapshotAt: new Date().toISOString(),
    };

    const content = `Shared a reel · ${reel.title}`;

    const message = await this.chatService.saveMessage(
      normalizedConversationId,
      userId,
      content,
      'reel_share',
      metadata,
    );

    try {
      await this.chatGateway.broadcastNewMessage(
        normalizedConversationId,
        message,
      );
    } catch (err) {
      this.logger.warn(
        `reel_share broadcast failed for conversation ${normalizedConversationId}: ${err instanceof Error ? err.message : err}`,
      );
    }

    return message;
  }

  private async assertConversationParticipant(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!participant) {
      throw new ForbiddenException('Not a participant');
    }
  }

  private async loadAggregatedReactions(
    messageId: string,
  ): Promise<AggregatedReaction[]> {
    const rows = await this.prisma.messageReaction.findMany({
      where: { messageId },
      select: { emoji: true, userId: true },
    });
    return aggregateReactions(rows);
  }
}
