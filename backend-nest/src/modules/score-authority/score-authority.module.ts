import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ScoreAuthorityController } from './score-authority.controller';
import { ScoreAuthorityService } from './score-authority.service';

@Module({
  imports: [PrismaModule],
  controllers: [ScoreAuthorityController],
  providers: [ScoreAuthorityService],
  exports: [ScoreAuthorityService],
})
export class ScoreAuthorityModule {}
