import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { MatchmakingModule } from './modules/matchmaking/matchmaking.module';
import { LivekitModule } from './modules/livekit/livekit.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { FriendshipModule } from './modules/friendship/friendship.module';
import { ChatModule } from './modules/chat/chat.module';
import { UsersModule } from './modules/users/users.module';
import { ConversationalTutorModule } from './modules/conversational-tutor/conversational-tutor.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import livekitConfig from './config/livekit.config';
import throttleConfig from './config/throttler.config';
import { PrismaModule } from './database/prisma/prisma.module';
import { ReliabilityModule } from './modules/reliability/reliability.module';
import { ReelsModule } from './modules/reels/reels.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { PronunciationModule } from './modules/pronunciation/pronunciation.module';
import { ProgressModule } from './modules/progress/progress.module';
import { HomeModule } from './modules/home/home.module';
import { BrainModule } from './modules/brain/brain.module';
import { InternalModule } from './modules/internal/internal.module';
import { TtsModule } from './modules/tts/tts.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HomePracticeModule } from './modules/home-practice/home-practice.module';
import { InCallCoachingModule } from './modules/in-call-coaching/in-call-coaching.module';
import { SentryModule } from '@sentry/nestjs/setup';
import { MetricsModule } from './metrics/metrics.module';
import { AppThrottlerGuard } from './guards/app-throttler.guard';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    SentryModule.forRoot(),
    MetricsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, livekitConfig, throttleConfig],
      envFilePath: ['.env', '.env.local'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const enabled = config.get<boolean>('throttle.enabled') !== false;
        const ttl = config.get<number>('throttle.defaultTtlMs') ?? 60_000;
        const defaultLimit = config.get<number>('throttle.defaultLimit') ?? 120;
        const matchmakingLimit =
          config.get<number>('throttle.matchmakingLimit') ?? 30;
        return {
          skipIf: () => !enabled,
          throttlers: [
            { name: 'default', ttl, limit: defaultLimit },
            { name: 'matchmaking', ttl, limit: matchmakingLimit },
          ],
        };
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('REDIS_PORT') || 6379,
          username: configService.get('REDIS_USERNAME') || 'default',
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
    RedisModule,
    AuthModule,
    MatchmakingModule,
    LivekitModule,
    SessionsModule,
    TasksModule,
    FeedbackModule,
    IntegrationsModule,
    AssessmentModule,
    FriendshipModule,
    ChatModule,
    PrismaModule,
    UsersModule,
    ConversationalTutorModule,
    ReliabilityModule,
    ReelsModule,
    EngagementModule,
    PronunciationModule,
    ProgressModule,
    HomeModule,
    BrainModule,
    InternalModule,
    TtsModule,
    NotificationsModule,
    HomePracticeModule,
    InCallCoachingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
  ],
})
export class AppModule {}
