import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { aggregateReactions } from '../../common/aggregate-reactions';

@Injectable()
export class ChatService {
    constructor(private prisma: PrismaService) {}

    /**
     * Find existing conversation between two users, or create a new one.
     */
    async getOrCreateConversation(userAId: string, userBId: string): Promise<string> {
        // Find existing conversation between these two users
        const existing = await this.prisma.conversation.findFirst({
            where: {
                AND: [
                    { participants: { some: { userId: userAId } } },
                    { participants: { some: { userId: userBId } } },
                ],
            },
            include: { participants: true },
        });

        if (existing && existing.participants.length === 2) {
            return existing.id;
        }

        // Create new conversation
        const conversation = await this.prisma.conversation.create({
            data: {
                participants: {
                    create: [{ userId: userAId }, { userId: userBId }],
                },
            },
        });

        return conversation.id;
    }

    /**
     * Get paginated messages for a conversation.
     */
    async getMessages(
        conversationId: string,
        userId: string,
        limit = 30,
        before?: string,
    ) {
        // Verify user is participant
        const participant = await this.prisma.conversationParticipant.findUnique({
            where: {
                conversationId_userId: { conversationId, userId },
            },
        });

        if (!participant) throw new ForbiddenException('Not a participant');

        const messages = await this.prisma.message.findMany({
            where: {
                conversationId,
                ...(before && { createdAt: { lt: new Date(before) } }),
            },
            include: {
                reactions: {
                    select: { emoji: true, userId: true },
                },
                sender: {
                    select: {
                        id: true,
                        fname: true,
                        lname: true,
                        profile: { select: { avatarUrl: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        // Update lastReadAt
        await this.prisma.conversationParticipant.update({
            where: { conversationId_userId: { conversationId, userId } },
            data: { lastReadAt: new Date() },
        });

        // Return in chronological order with aggregated reactions
        return messages.reverse().map((m) => {
            const { reactions: reactionRows, sender, ...rest } = m;
            return {
                ...rest,
                reactions: aggregateReactions(reactionRows),
                sender: {
                    id: sender.id,
                    name: `${sender.fname} ${sender.lname}`.trim(),
                    profileImage: sender.profile?.avatarUrl || null,
                },
            };
        });
    }

    /**
     * Save a new message to a conversation.
     */
    async saveMessage(
        conversationId: string,
        senderId: string,
        content: string,
        type: string = 'text',
        metadata?: any,
    ) {
        const message = await this.prisma.message.create({
            data: {
                conversationId,
                senderId,
                content,
                type,
                metadata,
                readBy: [senderId],
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        fname: true,
                        lname: true,
                        profile: { select: { avatarUrl: true } },
                    },
                },
            },
        });

        // Update conversation updatedAt
        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });

        return {
            ...message,
            sender: {
                id: message.sender.id,
                name: `${message.sender.fname} ${message.sender.lname}`.trim(),
                profileImage: message.sender.profile?.avatarUrl || null,
            },
        };
    }

    /**
     * Mark all messages in a conversation as read by a user.
     */
    async markAsRead(conversationId: string, userId: string) {
        await this.prisma.conversationParticipant.update({
            where: { conversationId_userId: { conversationId, userId } },
            data: { lastReadAt: new Date() },
        });

        // Mark all unread messages as read by this user
        const unreadMessages = await this.prisma.message.findMany({
            where: {
                conversationId,
                NOT: { readBy: { has: userId } },
            },
            select: { id: true, readBy: true },
        });

        if (unreadMessages.length > 0) {
            await Promise.all(
                unreadMessages.map(msg =>
                    this.prisma.message.update({
                        where: { id: msg.id },
                        data: { readBy: [...msg.readBy, userId] },
                    }),
                ),
            );
        }
    }

    /** One grouped query per user instead of COUNT per conversation (N+1). */
    private async unreadCountsByConversation(
        userId: string,
    ): Promise<Map<string, number>> {
        const rows = await this.prisma.$queryRaw<
            Array<{ conversationId: string; unread: number }>
        >`
            SELECT
                cp."conversationId" AS "conversationId",
                COUNT(m.id)::int AS unread
            FROM "ConversationParticipant" cp
            INNER JOIN "Message" m
                ON m."conversationId" = cp."conversationId"
            WHERE cp."userId" = ${userId}
                AND m."senderId" <> ${userId}
                AND m."createdAt" > cp."lastReadAt"
            GROUP BY cp."conversationId"
        `;
        return new Map(rows.map((r) => [r.conversationId, Number(r.unread)]));
    }

    /**
     * Get total unread message count for a user across all conversations.
     */
    async getUnreadCount(userId: string): Promise<number> {
        const byConversation = await this.unreadCountsByConversation(userId);
        let total = 0;
        for (const n of byConversation.values()) {
            total += n;
        }
        return total;
    }

    /**
     * Get all conversations for a user with last message and partner info.
     */
    async getUserConversations(userId: string) {
        const participations = await this.prisma.conversationParticipant.findMany({
            where: { userId },
            include: {
                conversation: {
                    include: {
                        messages: {
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                            include: {
                                sender: { select: { id: true, fname: true, lname: true } },
                            },
                        },
                        participants: {
                            where: { NOT: { userId } },
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        fname: true,
                                        lname: true,
                                        level: true,
                                        profile: { select: { avatarUrl: true } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: { conversation: { updatedAt: 'desc' } },
        });

        const unreadByConversation =
            await this.unreadCountsByConversation(userId);

        const results = participations.map((p) => {
            const lastMessage = p.conversation.messages[0];
            const otherParticipant = p.conversation.participants[0];
            const unreadCount =
                unreadByConversation.get(p.conversationId) ?? 0;

            return {
                conversationId: p.conversationId,
                partner: otherParticipant?.user
                    ? {
                          id: otherParticipant.user.id,
                          name: `${otherParticipant.user.fname} ${otherParticipant.user.lname}`.trim(),
                          profileImage: otherParticipant.user.profile?.avatarUrl || null,
                          level: otherParticipant.user.level,
                      }
                    : null,
                lastMessage: lastMessage
                    ? {
                          content:
                              lastMessage.type === 'reel_share'
                                  ? `Shared a reel · ${(lastMessage.metadata as { title?: string } | null)?.title ?? 'Reel'}`
                                  : lastMessage.content,
                          type: lastMessage.type,
                          senderName: `${lastMessage.sender.fname} ${lastMessage.sender.lname}`.trim(),
                          senderId: lastMessage.senderId,
                          createdAt: lastMessage.createdAt,
                      }
                    : null,
                unreadCount,
                lastActivityAt: p.conversation.updatedAt,
            };
        });

        return results;
    }
}
