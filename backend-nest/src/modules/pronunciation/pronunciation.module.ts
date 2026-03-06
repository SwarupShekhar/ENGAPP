import { Module } from '@nestjs/common';
import { BrainModule } from '../brain/brain.module';
import { ReelsModule } from '../reels/reels.module';
import { PronunciationFeedbackService } from './pronunciation-feedback.service';
import { PronunciationScorerService } from './pronunciation-scorer.service';
import { PronunciationService } from './pronunciation.service';

@Module({
  imports: [BrainModule, ReelsModule],
  providers: [
    PronunciationService,
    PronunciationScorerService,
    PronunciationFeedbackService,
  ],
  exports: [
    PronunciationService,
    PronunciationScorerService,
    PronunciationFeedbackService,
  ],
})
export class PronunciationModule {}
