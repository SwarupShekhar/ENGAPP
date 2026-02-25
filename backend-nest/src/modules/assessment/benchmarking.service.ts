import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface BenchmarkData {
  currentScore: number;
  cefr: string;
  peerGroup: {
    average: number;
    stddev: number;
    size: number;
  };
  percentile: number;
  cefrRange: { min: number; max: number };
  nativeSpeakerRange: { min: number; max: number };
}

@Injectable()
export class BenchmarkingService {
  private readonly logger = new Logger(BenchmarkingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generateBenchmarks(
    userId: string,
    currentScore: number,
    cefr: string,
  ): Promise<BenchmarkData> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // PRIVACY: If user has opted out of benchmarking, return self-only data
      if (!(user as any).allowBenchmarking) {
        this.logger.log(`User ${userId} opted out of benchmarking`);
        const cefrBenchmarks = this.getCefrBenchmarks();
        return {
          currentScore,
          cefr,
          peerGroup: { average: currentScore, stddev: 0, size: 1 },
          percentile: 50, // Neutral — no peer comparison
          cefrRange: cefrBenchmarks[cefr] || { min: 0, max: 100 },
          nativeSpeakerRange: { min: 90, max: 98 },
        };
      }

      // Peer group: Same CEFR level, similar learning duration (±30 days)
      // Only include users who have opted into benchmarking
      const peerGroupQuery: any = {
        overallLevel: cefr,
        status: 'COMPLETED',
        overallScore: { not: null },
        user: {
          allowBenchmarking: true,
        },
      };

      if ((user as any).learningDurationDays > 0) {
        peerGroupQuery.user = {
          ...peerGroupQuery.user,
          learningDurationDays: {
            gte: Math.max(0, (user as any).learningDurationDays - 30),
            lte: (user as any).learningDurationDays + 30,
          },
        };
      }

      const peerAssessments = await (
        this.prisma as any
      ).assessmentSession.findMany({
        where: peerGroupQuery,
        select: { overallScore: true },
      });

      const scores = peerAssessments.map((a) => a.overallScore);
      const avg =
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : currentScore;

      // Calculate standard deviation
      const diffs = scores.map((s) => Math.pow(s - avg, 2));
      const stddev =
        scores.length > 1
          ? Math.sqrt(diffs.reduce((a, b) => a + b, 0) / (scores.length - 1))
          : 5; // Default stddev

      // Calculate percentile
      const belowCount = scores.filter((s) => s < currentScore).length;
      const totalCount = scores.length || 1;
      const percentile = Math.round((belowCount / totalCount) * 100);

      // CEFR level benchmarks
      const cefrBenchmarks = this.getCefrBenchmarks();

      return {
        currentScore,
        cefr,
        peerGroup: {
          average: Math.round(avg),
          stddev: Math.round(stddev),
          size: totalCount,
        },
        percentile,
        cefrRange: cefrBenchmarks[cefr] || { min: 0, max: 100 },
        nativeSpeakerRange: { min: 90, max: 98 },
      };
    } catch (error) {
      this.logger.error(`Error generating benchmarks: ${error.message}`);
      // Fallback
      return {
        currentScore,
        cefr,
        peerGroup: { average: currentScore - 5, stddev: 5, size: 1 },
        percentile: 75,
        cefrRange: { min: 40, max: 60 },
        nativeSpeakerRange: { min: 90, max: 98 },
      };
    }
  }

  private getCefrBenchmarks(): Record<string, { min: number; max: number }> {
    return {
      A1: { min: 0, max: 30 },
      A2: { min: 30, max: 45 },
      B1: { min: 45, max: 60 },
      B2: { min: 60, max: 75 },
      C1: { min: 75, max: 88 },
      C2: { min: 88, max: 100 },
    };
  }
}
