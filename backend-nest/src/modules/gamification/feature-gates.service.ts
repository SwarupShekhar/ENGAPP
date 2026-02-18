import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class FeatureGatesService {
  constructor(private prisma: PrismaService) {}

  async checkFeatureAccess(userId: string, feature: string): Promise<boolean> {
    const userPoints = await this.prisma.userPoints.findUnique({
      where: { userId },
    });

    const reliability = await this.prisma.userReliability.findUnique({
      where: { userId },
    });

    const level = userPoints?.level || 1;
    const tier = reliability?.tier || 'bronze';

    // Feature gates based on level and tier
    const gates: Record<string, boolean> = {
      // Matchmaking features
      'premium_matchmaking': level >= 5 && tier !== 'bronze',
      'choose_partner_level': level >= 10,
      'skip_partner': level >= 3,
      
      // AI tutor features
      'unlimited_ai_sessions': level >= 15 || tier === 'platinum',
      'voice_selection': level >= 7,
      'custom_prompts': level >= 20,
      
      // Social features
      'chat_with_connections': tier !== 'bronze',
      'create_study_groups': level >= 12,
      'leaderboard_visibility': tier === 'gold' || tier === 'platinum',
      
      // Content features
      'advanced_analytics': level >= 8,
      'export_transcripts': level >= 5,
      'custom_practice_topics': level >= 10,
    };

    return gates[feature] || false;
  }
}
