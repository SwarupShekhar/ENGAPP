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
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import livekitConfig from './config/livekit.config';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }