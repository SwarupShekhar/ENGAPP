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
} from './engagement.constants';

export type { AggregatedReaction };

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
    const [existingLike, totalLikes] = await Promise.all([
      this.prisma.reelLike.findUnique({
        where: {
          userId_strapiReelId: { userId, strapiReelId },
        },
      }),
      this.prisma.reelLike.count({ where: { strapiReelId } }),
    ]);

    return {
      likedByMe: !!existingLike,
      totalLikes,
    };
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
