import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import {
  ConversationalTutorService,
  MayaSessionJobData,
} from './conversational-tutor.service';
import {
  SESSIONS_MAYA_QUEUE,
  sessionsMayaConcurrency,
} from '../../queues/sessions-queue.constants';

@Processor(SESSIONS_MAYA_QUEUE)
export class MayaSessionProcessor {
  private readonly logger = new Logger(MayaSessionProcessor.name);

  constructor(private readonly tutorService: ConversationalTutorService) {}

  @OnQueueFailed()
  onFailed(job: Job<MayaSessionJobData>, error: Error) {
    this.logger.error(
      `Maya job ${job.id} (session ${job.data?.sessionId}) FAILED after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }

  @Process({ name: 'process-maya-session', concurrency: sessionsMayaConcurrency() })
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
