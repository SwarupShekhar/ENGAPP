import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ClerkGuard } from '../auth/clerk.guard';
import { VocabularyService } from './services/vocabulary.service';

@Controller('vocabulary')
@UseGuards(ClerkGuard)
export class VocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) {}

  @Get('lookup')
  lookup(@Query('word') word?: string) {
    return this.vocabularyService.lookup(word ?? '');
  }
}
