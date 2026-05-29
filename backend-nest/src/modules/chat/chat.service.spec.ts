import { Test } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('ChatService', () => {
  let service: ChatService;
  const prisma = {
    $queryRaw: jest.fn(),
    conversationParticipant: { findMany: jest.fn() },
    conversation: { findFirst: jest.fn(), create: jest.fn() },
    message: { findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
  };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(ChatService);
    jest.clearAllMocks();
  });

  it('getUnreadCount uses one grouped query (no per-conversation COUNT)', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { conversationId: 'c1', unread: 2 },
      { conversationId: 'c2', unread: 3 },
    ]);

    const total = await service.getUnreadCount('user-1');

    expect(total).toBe(5);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
