import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import {
  ConversationalTutorService,
  MayaSessionJobData,
} from './conversational-tutor.service';

@Processor('sessions')
export class MayaSessionProcessor {
  private readonly logger = new Logger(MayaSessionProcessor.name);

  constructor(private readonly tutorService: ConversationalTutorService) {}

  @OnQueueFailed()
  onFailed(job: Job<MayaSessionJobData>, error: Error) {
    this.logger.error(
      `Maya job ${job.id} (session ${job.data?.sessionId}) FAILED after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }

  @Process('process-maya-session')
  async handleProcessMayaSession(job: Job<MayaSessionJobData>) {
    const { sessionId } = job.data;
    this.logger.log(
      `[MayaSessionProcessor] Processing Maya session ${sessionId} (deferred analysis)...`,
    );
    await this.tutorService.completeMayaSessionAnalysis(job.data);
    this.logger.log(
      `[MayaSessionProcessor] Maya session ${sessionId} analysis completed.`,
    );
  }
}
