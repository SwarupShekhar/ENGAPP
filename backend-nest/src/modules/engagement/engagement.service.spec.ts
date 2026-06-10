import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { ChatGateway } from '../chat/chat.gateway';
import { ReelsService } from '../reels/reels.service';

describe('EngagementService', () => {
  let service: EngagementService;

  const prisma = {
    reelLike: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
    },
    messageReaction: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    conversationParticipant: {
      findUnique: jest.fn(),
    },
  };

  const chatService = {
    saveMessage: jest.fn(),
  };

  const chatGateway = {
    emitReactionUpdated: jest.fn(),
    broadcastNewMessage: jest.fn(),
  };

  const reelsService = {
    getReelById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EngagementService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChatService, useValue: chatService },
        { provide: ChatGateway, useValue: chatGateway },
        { provide: ReelsService, useValue: reelsService },
      ],
    }).compile();

    service = module.get<EngagementService>(EngagementService);
    jest.clearAllMocks();
  });

  describe('toggleReelLike', () => {
    it('creates a like when none exists', async () => {
      prisma.reelLike.findUnique.mockResolvedValue(null);
      prisma.reelLike.create.mockResolvedValue({ id: 'like-1' });
      prisma.reelLike.count.mockResolvedValue(3);

      const result = await service.toggleReelLike('user-1', 42);

      expect(result).toEqual({ liked: true, totalLikes: 3 });
      expect(prisma.reelLike.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', strapiReelId: 42 },
      });
    });

    it('removes a like when one already exists', async () => {
      prisma.reelLike.findUnique.mockResolvedValue({ id: 'like-1' });
      prisma.reelLike.delete.mockResolvedValue({});
      prisma.reelLike.count.mockResolvedValue(2);

      const result = await service.toggleReelLike('user-1', 42);

      expect(result).toEqual({ liked: false, totalLikes: 2 });
      expect(prisma.reelLike.delete).toHaveBeenCalledWith({
        where: { id: 'like-1' },
      });
    });
  });

  describe('setMessageReaction', () => {
    const messageId = 'msg-1';
    const conversationId = 'conv-1';

    beforeEach(() => {
      prisma.message.findUnique.mockResolvedValue({
        id: messageId,
        conversationId,
      });
      prisma.conversationParticipant.findUnique.mockResolvedValue({ id: 'p-1' });
      prisma.messageReaction.findMany.mockResolvedValue([
        { emoji: '❤️', userId: 'user-1' },
      ]);
    });

    it('rejects invalid emoji', async () => {
      await expect(
        service.setMessageReaction('user-1', messageId, 'not-an-emoji'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a reaction for allowed emoji', async () => {
      prisma.messageReaction.findUnique.mockResolvedValue(null);
      prisma.messageReaction.create.mockResolvedValue({ id: 'r-1' });

      const result = await service.setMessageReaction(
        'user-1',
        messageId,
        '❤️',
      );

      expect(prisma.messageReaction.create).toHaveBeenCalledWith({
        data: { messageId, userId: 'user-1', emoji: '❤️' },
      });
      expect(chatGateway.emitReactionUpdated).toHaveBeenCalledWith(
        conversationId,
        expect.objectContaining({ messageId }),
      );
      expect(result).toEqual([
        { emoji: '❤️', count: 1, userIds: ['user-1'] },
      ]);
    });

    it('throws when message is missing', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.setMessageReaction('user-1', messageId, '❤️'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when user is not a participant', async () => {
      prisma.conversationParticipant.findUnique.mockResolvedValue(null);

      await expect(
        service.setMessageReaction('user-1', messageId, '❤️'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('shareReel', () => {
    it('rejects empty conversationId', async () => {
      await expect(service.shareReel('user-1', 42, '')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('creates reel_share message and broadcasts', async () => {
      prisma.conversationParticipant.findUnique.mockResolvedValue({ id: 'p-1' });
      reelsService.getReelById.mockResolvedValue({
        id: 42,
        title: 'Test Reel',
        muxPlaybackId: 'mux123',
        difficulty_level: 'A2',
      });
      const savedMessage = { id: 'msg-share', type: 'reel_share' };
      chatService.saveMessage.mockResolvedValue(savedMessage);

      const result = await service.shareReel('user-1', 42, 'conv-1');

      expect(chatService.saveMessage).toHaveBeenCalledWith(
        'conv-1',
        'user-1',
        'Shared a reel · Test Reel',
        'reel_share',
        expect.objectContaining({
          strapiReelId: 42,
          title: 'Test Reel',
        }),
      );
      expect(chatGateway.broadcastNewMessage).toHaveBeenCalledWith(
        'conv-1',
        savedMessage,
      );
      expect(result).toBe(savedMessage);
    });
  });
});
