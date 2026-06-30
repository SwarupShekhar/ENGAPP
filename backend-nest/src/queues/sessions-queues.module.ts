import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import {
  DEFAULT_MAYA_JOB_OPTIONS,
  DEFAULT_P2P_JOB_OPTIONS,
  SESSIONS_MAYA_QUEUE,
  SESSIONS_P2P_QUEUE,
} from './sessions-queue.constants';

/**
 * Registers split Bull queues so P2P call analysis cannot starve Maya (and vice versa).
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: SESSIONS_P2P_QUEUE,
      defaultJobOptions: DEFAULT_P2P_JOB_OPTIONS,
    }),
    BullModule.registerQueue({
      name: SESSIONS_MAYA_QUEUE,
      defaultJobOptions: DEFAULT_MAYA_JOB_OPTIONS,
    }),
  ],
  exports: [BullModule],
})
export class SessionsQueuesModule {}
