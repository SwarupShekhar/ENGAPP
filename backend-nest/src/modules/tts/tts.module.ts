import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TtsController } from './tts.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [TtsController],
})
export class TtsModule {}
