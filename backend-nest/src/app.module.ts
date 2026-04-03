import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { PrismaModule } from './database/prisma/prisma.module';
import { ReliabilityModule } from './modules/reliability/reliability.module';
import { ReelsModule } from './modules/reels/reels.module';
import { PronunciationModule } from './modules/pronunciation/pronunciation.module';
import { ProgressModule } from './modules/progress/progress.module';
import { HomeModule } from './modules/home/home.module';
import { BrainModule } from './modules/brain/brain.module';
import { InternalModule } from './modules/internal/internal.module';
import { TtsModule } from './modules/tts/tts.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, livekitConfig],
      envFilePath: ['.env', '.env.local'],
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
    PronunciationModule,
    ProgressModule,
    HomeModule,
    BrainModule,
    InternalModule,
    TtsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
