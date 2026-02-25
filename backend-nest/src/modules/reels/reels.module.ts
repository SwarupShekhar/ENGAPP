import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';
import { WeaknessService } from './weakness.service';
import { IntegrationsModule } from '../../integrations/integrations.module';

@Module({
  imports: [
    HttpModule,
    IntegrationsModule, // Provides MuxService
  ],
  controllers: [ReelsController],
  providers: [ReelsService, WeaknessService],
  exports: [ReelsService, WeaknessService],
})
export class ReelsModule {}
