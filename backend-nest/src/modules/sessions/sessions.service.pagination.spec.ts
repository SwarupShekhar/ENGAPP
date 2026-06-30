import { Test } from '@nestjs/testing';
import { SessionsService } from './sessions.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AzureStorageService } from '../../integrations/azure-storage.service';
import { ReliabilityService } from '../reliability/reliability.service';
import { TranscriptionService } from '../livekit/transcription.service';
import { PronunciationService } from '../pronunciation/pronunciation.service';
import { InCallCoachingService } from '../in-call-coaching/in-call-coaching.service';
import { getQueueToken } from '@nestjs/bull';
import { SESSIONS_P2P_QUEUE } from '../../queues/sessions-queue.constants';

describe('SessionsService pagination', () => {
  let service: SessionsService;
  const prisma = {
    conversationSession: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AzureStorageService, useValue: {} },
        { provide: ReliabilityService, useValue: {} },
        { provide: TranscriptionService, useValue: {} },
        { provide: PronunciationService, useValue: {} },
        { provide: InCallCoachingService, useValue: {} },
        { provide: getQueueToken(SESSIONS_P2P_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();
    service = mod.get(SessionsService);
    jest.clearAllMocks();
  });

  it('getUserSessions caps page size and returns cursor metadata', async () => {
    const now = new Date();
    prisma.conversationSession.findMany.mockResolvedValue([
      { id: 's1', createdAt: now },
      { id: 's2', createdAt: new Date(now.getTime() - 1000) },
      { id: 's3', createdAt: new Date(now.getTime() - 2000) },
    ]);

    const page = await service.getUserSessions('u1', { limit: 2 });

    expect(prisma.conversationSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
  });
});
