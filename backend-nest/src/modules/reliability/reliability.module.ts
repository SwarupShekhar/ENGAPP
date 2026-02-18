import { Module } from '@nestjs/common';
import { ReliabilityService } from './reliability.service';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ReliabilityController } from './reliability.controller';

@Module({
  imports: [PrismaModule],
  providers: [ReliabilityService],
  controllers: [ReliabilityController],
  exports: [ReliabilityService],
})
export class ReliabilityModule {}
