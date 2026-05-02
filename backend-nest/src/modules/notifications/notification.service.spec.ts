import { Test } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { PushyService } from './pushy.service';
import { PrismaService } from '../../database/prisma/prisma.service';

const mockPushy = { send: jest.fn() };
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
        { provide: PushyService, useValue: mockPushy },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(NotificationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('notify', () => {
    it('skips silently when user has no device tokens', async () => {
      mockPrisma.deviceToken.findMany.mockResolvedValue([]);

      await service.notify('user1', 'reminder', { streakDays: 3 });

      expect(mockPushy.send).not.toHaveBeenCalled();
      expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('writes log before sending and marks failed on error', async () => {
      mockPrisma.deviceToken.findMany.mockResolvedValue([
        { token: 'tok1', platform: 'ios' },
      ]);
      mockPrisma.notificationLog.create.mockResolvedValue({ id: 'log1' });
      mockPushy.send.mockRejectedValue(new Error('pushy down'));

      await service.notify('user1', 'reminder', { streakDays: 2 });

      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user1', type: 'reminder', status: 'sent' }),
        }),
      );
      expect(mockPrisma.notificationLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'log1' },
          data: expect.objectContaining({ status: 'failed' }),
        }),
      );
    });

    it('removes invalid tokens after send', async () => {
      mockPrisma.deviceToken.findMany.mockResolvedValue([
        { id: 'dt1', token: 'dead-token', platform: 'android' },
      ]);
      mockPrisma.notificationLog.create.mockResolvedValue({ id: 'log1' });
      mockPushy.send.mockResolvedValue([
        { token: 'dead-token', success: false, invalidToken: true },
      ]);

      await service.notify('user1', 'message', { senderName: 'Bob', preview: 'hey' });

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
      mockPrisma.deviceToken.findMany.mockResolvedValue([]);

      await service.retryFailed();

      expect(mockPrisma.notificationLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'log1' },
          data: { status: 'retrying' },
        }),
      );
    });
  });
});
