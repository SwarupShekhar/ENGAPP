import { Module } from '@nestjs/common';
import { HomePracticeController } from './home-practice.controller';
import { HomePracticeService } from './home-practice.service';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { HomeModule } from '../home/home.module';
import { PronunciationModule } from '../pronunciation/pronunciation.module';

@Module({
  imports: [PrismaModule, HomeModule, PronunciationModule],
  controllers: [HomePracticeController],
  providers: [HomePracticeService],
})
export class HomePracticeModule {}
