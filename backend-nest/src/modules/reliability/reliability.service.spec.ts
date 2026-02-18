import { Test, TestingModule } from '@nestjs/testing';
import { ReliabilityService } from './reliability.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('ReliabilityService', () => {
  let service: ReliabilityService;
  let prisma: any;

  const mockPrisma = {
    userReliability: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReliabilityService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReliabilityService>(ReliabilityService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should return 100 for a new user', async () => {
    prisma.userReliability.findUnique.mockResolvedValue(null);
    const score = await service.calculateReliability('user1');
    expect(score).toBe(100);
    expect(prisma.userReliability.create).toHaveBeenCalled();
  });

  it('should calculate score correctly with penalties', async () => {
    // Mock user data: 10 sessions, 8 completed, 2 early exits
    prisma.userReliability.findUnique.mockResolvedValue({
      userId: 'user1',
      reliabilityScore: 100,
      totalSessions: 10,
      completedSessions: 8,
      earlyExits: 2,
      noShows: 0,
      reportsReceived: 0,
      consecutiveCompletions: 0,
      lastSessionAt: new Date(),
      lastDisconnectAt: null,
    });

    // Calc: Rate = 80%. Penalty = 2*5 + 0 + 0 = 10. Bonus = 0.
    // Raw = 80 - 10 = 70.
    const score = await service.calculateReliability('user1');
    expect(score).toBe(70);
  });

  it('should respect the floor of 60', async () => {
    // Very bad user
    prisma.userReliability.findUnique.mockResolvedValue({
      userId: 'bad_user',
      reliabilityScore: 50,
      totalSessions: 10,
      completedSessions: 0, // 0% rate
      earlyExits: 10,       // 50 penalty
      noShows: 5,           // 50 penalty
      reportsReceived: 5,   // 75 penalty
      consecutiveCompletions: 0,
    });

    // Raw would be extremely negative
    const score = await service.calculateReliability('bad_user');
    expect(score).toBe(60);
  });

  it('should apply grace period for network drops', async () => {
    const now = new Date();
    const disconnectTime = new Date(now.getTime() - 30000); // 30s ago (within 90s grace)

    prisma.userReliability.findUnique.mockResolvedValue({
      userId: 'user_network_drop',
      reliabilityScore: 90,
      totalSessions: 10,
      completedSessions: 9,
      earlyExits: 1, // 5 penalty
      noShows: 0,
      reportsReceived: 0,
      consecutiveCompletions: 0,
      lastSessionAt: new Date(now.getTime() - 60000), // Session started 1 min ago
      lastDisconnectAt: disconnectTime,
      lastDisconnectReason: 'network_drop',
    });

    // Early exit penalty (5) should be reduced by 10 (min 0) due to grace/reason
    // Rate = 90%. Penalty = 0.
    const score = await service.calculateReliability('user_network_drop');
    // Result should be roughly 90 or higher due to bonus?
    // Bonus = 0.
    // Result 90.
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it('should grant bonus for streak', async () => {
    prisma.userReliability.findUnique.mockResolvedValue({
      userId: 'streak_user',
      reliabilityScore: 90,
      totalSessions: 20,
      completedSessions: 20, // 100%
      earlyExits: 0,
      noShows: 0,
      reportsReceived: 0,
      consecutiveCompletions: 10, // Bonus = min(20, 20) = 20
    });

    // 100 - 0 + 20 = 120 -> clamped to 100
    const score = await service.calculateReliability('streak_user');
    expect(score).toBe(100);
  });
});
