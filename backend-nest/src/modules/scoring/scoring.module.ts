import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { BrainModule } from '../brain/brain.module';
import { ProgressModule } from '../progress/progress.module';
import { ScoreAuthorityModule } from '../score-authority/score-authority.module';
import { PrismaModule } from '@app/prisma/prisma.module';
import { ScoringController } from './scoring.controller';
import { ClerkGuard } from '../auth/clerk.guard';

@Module({
  imports: [PrismaModule, BrainModule, ProgressModule, ScoreAuthorityModule],
  controllers: [ScoringController],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
