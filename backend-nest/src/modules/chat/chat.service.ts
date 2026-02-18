import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

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

        // Return in chronological order
        return messages.reverse().map(m => ({
            ...m,
            sender: {
                id: m.sender.id,
                name: `${m.sender.fname} ${m.sender.lname}`.trim(),
                profileImage: m.sender.profile?.avatarUrl || null,
            },
        }));
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

    /**
     * Get total unread message count for a user across all conversations.
     */
    async getUnreadCount(userId: string): Promise<number> {
        const participants = await this.prisma.conversationParticipant.findMany({
            where: { userId },
        });

        let total = 0;
        for (const participant of participants) {
            const count = await this.prisma.message.count({
                where: {
                    conversationId: participant.conversationId,
                    NOT: { senderId: userId },
                    createdAt: { gt: participant.lastReadAt },
                },
            });
            total += count;
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

        const results = await Promise.all(participations.map(async p => {
            const lastMessage = p.conversation.messages[0];
            const otherParticipant = p.conversation.participants[0];

            const unreadCount = await this.prisma.message.count({
                where: {
                    conversationId: p.conversationId,
                    NOT: { senderId: userId },
                    createdAt: { gt: p.lastReadAt },
                },
            });

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
                          content: lastMessage.content,
                          type: lastMessage.type,
                          senderName: `${lastMessage.sender.fname} ${lastMessage.sender.lname}`.trim(),
                          senderId: lastMessage.senderId,
                          createdAt: lastMessage.createdAt,
                      }
                    : null,
                unreadCount,
                lastActivityAt: p.conversation.updatedAt,
            };
        }));

        return results;
    }
}
