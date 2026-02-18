
import { ReliabilityService } from '../src/modules/reliability/reliability.service';

// Mock Prisma Service
class MockPrismaService {
    public userReliability = {
        findUnique: async (args: any) => {
            console.log('MockPrisma: findUnique', args);
            return this.mockData[args.where.userId] || null;
        },
        create: async (args: any) => {
            console.log('MockPrisma: create', args);
            this.mockData[args.data.userId] = { ...args.data, ...this.defaults };
            return this.mockData[args.data.userId];
        },
        update: async (args: any) => {
            console.log('MockPrisma: update', args);
            const current = this.mockData[args.where.userId];
            if (current) {
                // Handle increments if any (simplified)
                const newData = { ...args.data };
                // ... complex increment logic omitted for brevity in mock, assuming calculated values passed for score
                this.mockData[args.where.userId] = { ...current, ...newData };
            }
            return this.mockData[args.where.userId];
        },
        upsert: async () => {},
    };
    public user = {
        findUnique: async () => ({ points: { level: 5 } }),
    };

    private mockData: Record<string, any> = {};
    private defaults = {
        totalSessions: 0,
        completedSessions: 0,
        earlyExits: 0,
        noShows: 0,
        reportsReceived: 0,
        consecutiveCompletions: 0,
        lastSessionAt: null,
        lastDisconnectAt: null,
        lastDisconnectReason: null
    };

    setMockData(userId: string, data: any) {
        this.mockData[userId] = { ...this.defaults, ...data };
    }
}

async function runTest() {
    console.log('--- Starting Reliability Service Verification ---');
    
    // 1. Setup
    const mockPrisma = new MockPrismaService();
    const service = new ReliabilityService(mockPrisma as any);

    // 2. Test New User
    console.log('\n[Test 1] New User Initialization');
    const score1 = await service.calculateReliability('user_new');
    console.log(`> Score: ${score1} (Expected: 100)`);
    if (score1 !== 100) throw new Error('Test 1 Failed');

    // 3. Test Penalties
    console.log('\n[Test 2] User with penalties');
    // 10 total, 8 completed, 2 early exits. No grace.
    // Rate = 80. Penalty = 10. Result = 70.
    mockPrisma.setMockData('user_penalties', {
        userId: 'user_penalties',
        reliabilityScore: 100,
        totalSessions: 10,
        completedSessions: 8,
        earlyExits: 2,
        noShows: 0,
        reportsReceived: 0,
        consecutiveCompletions: 0
    });
    const score2 = await service.calculateReliability('user_penalties');
    console.log(`> Score: ${score2} (Expected: 70)`);
    if (score2 !== 70) throw new Error(`Test 2 Failed. Got ${score2}`);

    // 4. Test Floor
    console.log('\n[Test 3] Floor Protection');
    // 10 total, 0 completed, 10 early exits.
    // Rate = 0. Penalty = 50. Result = -50 -> floor 60.
    mockPrisma.setMockData('user_floor', {
        userId: 'user_floor',
        reliabilityScore: 50,
        totalSessions: 10,
        completedSessions: 0,
        earlyExits: 10,
        noShows: 0,
        reportsReceived: 0,
        consecutiveCompletions: 0
    });
    const score3 = await service.calculateReliability('user_floor');
    console.log(`> Score: ${score3} (Expected: 60)`);
    if (score3 !== 60) throw new Error(`Test 3 Failed. Got ${score3}`);

    // 5. Test Grace Period
    console.log('\n[Test 4] Grace Period');
    const now = new Date();
    // 1 total, 0 completed, 1 early exit. 30s ago. 
    // Rate = 0. Penalty = 5. Warning! Wait. 
    // If rate is based on COMPLETED sessions... 
    // The code says: (completed / total) * 100.
    // If 1 total, 0 completed -> rate 0.
    // Penalty: earlyExits * 5 = 5.
    // Grace period reduces penalty by 10. 5 - 10 = -5 -> max(0, -5) = 0.
    // Score = 0 - 0 + 0 = 0. -> Floor 60.
    // Wait, let's use a better example.
    // 10 total, 9 completed. 1 early exit (network drop).
    // Rate = 90. Penalty = 5.
    // Grace -> Penalty = 0.
    // Score = 90.
    mockPrisma.setMockData('user_grace', {
        userId: 'user_grace',
        reliabilityScore: 90,
        totalSessions: 10,
        completedSessions: 9,
        earlyExits: 1,
        noShows: 0,
        reportsReceived: 0,
        consecutiveCompletions: 0,
        lastSessionAt: new Date(now.getTime() - 60000),
        lastDisconnectAt: new Date(now.getTime() - 30000), // 30s ago
        lastDisconnectReason: 'network_drop'
    });
    const score4 = await service.calculateReliability('user_grace');
    console.log(`> Score: ${score4} (Expected: 90)`);
    if (score4 !== 90) throw new Error(`Test 4 Failed. Got ${score4}`);

    console.log('\n--- ALL TESTS PASSED ---');
}

runTest().catch(console.error);
