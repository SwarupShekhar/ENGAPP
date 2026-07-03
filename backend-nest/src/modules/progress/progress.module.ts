import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ScoreAuthorityModule } from '../score-authority/score-authority.module';

@Module({
  imports: [PrismaModule, ScoreAuthorityModule],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
