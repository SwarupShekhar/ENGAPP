import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { NotificationService } from './notification.service';
import { FcmService } from './fcm.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { PosthogAnalyticsService } from './posthog-analytics.service';

const mockFcm = { send: jest.fn(), hasValidConfig: jest.fn().mockReturnValue(true) };
const mockPosthog = { captureWordOfDayPushSent: jest.fn() };
const mockQueue = { add: jest.fn() };
const mockRedis = {
  getClient: jest.fn(() => ({
    set: jest.fn().mockResolvedValue('OK'),
  })),
};
const mockPrisma = {
  deviceToken: { findMany: jest.fn(), deleteMany: jest.fn() },
  notificationLog: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: FcmService, useValue: mockFcm },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: PosthogAnalyticsService, useValue: mockPosthog },
        { provide: getQueueToken('notifications'), useValue: mockQueue },
      ],
    }).compile();
    service = module.get(NotificationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('notify', () => {
    it('skips silently when user has no device tokens', async () => {
      mockPrisma.deviceToken.findMany.mockResolvedValue([]);
      mockPrisma.notificationLog.create.mockResolvedValue({ id: 'log1' });

      await service.notify('user1', 'reminder', { streakDays: 3 });

      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('delivers messages immediately without queue', async () => {
      mockPrisma.deviceToken.findMany.mockResolvedValue([
        { id: 'dt1', token: 'tok1', platform: 'android' },
      ]);
      mockPrisma.notificationLog.create.mockResolvedValue({ id: 'log1' });
      mockFcm.send.mockResolvedValue([{ token: 'tok1', success: true }]);
      mockPrisma.notificationLog.update.mockResolvedValue({ id: 'log1' });

      await service.notify('user1', 'message', {
        senderName: 'Alice',
        preview: 'Hello there',
        conversationId: 'conv1',
        messageId: 'msg1',
      });

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockFcm.send).toHaveBeenCalled();
    });

    it('writes log before sending and marks failed on error', async () => {
      mockPrisma.notificationLog.create.mockResolvedValue({ id: 'log1' });
      mockQueue.add.mockRejectedValueOnce(new Error('queue down'));

      await service.notify('user1', 'reminder', { streakDays: 2 });

      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user1', type: 'reminder', status: 'retrying' }),
        }),
      );
      expect(mockPrisma.notificationLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'log1' },
          data: expect.objectContaining({ status: 'failed' }),
        }),
      );
    });

    it('removes invalid tokens after worker send', async () => {
      mockPrisma.deviceToken.findMany.mockResolvedValue([
        { id: 'dt1', token: 'dead-token', platform: 'android' },
      ]);
      mockFcm.send.mockResolvedValue([
        { token: 'dead-token', success: false, invalidToken: true },
      ]);
      mockPrisma.notificationLog.update.mockResolvedValue({ id: 'log1' });

      await service.processDelivery({
        logId: 'log1',
        userId: 'user1',
        type: 'message',
        data: { senderName: 'Bob', preview: 'hey', conversationId: 'conv1' },
      });

      expect(mockPrisma.deviceToken.deleteMany).toHaveBeenCalledWith({
        where: { token: { in: ['dead-token'] } },
      });
    });
  });

  describe('retryFailed', () => {
    it('retries failed logs and marks them as retrying first', async () => {
      mockPrisma.notificationLog.findMany.mockResolvedValue([
        {
          id: 'log1',
          userId: 'u1',
          type: 'message',
          payload: { senderName: 'Alice', preview: 'hi' },
          attempts: 1,
        },
      ]);
      mockPrisma.deviceToken.findMany.mockResolvedValue([
        { id: 'dt1', token: 'tok1', platform: 'android' },
      ]);
      mockFcm.send.mockResolvedValue([{ token: 'tok1', success: true }]);
      mockPrisma.notificationLog.update.mockResolvedValue({ id: 'log1' });

      await service.retryFailed();

      expect(mockPrisma.notificationLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'log1' },
          data: { status: 'retrying' },
        }),
      );
      expect(mockFcm.send).toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
