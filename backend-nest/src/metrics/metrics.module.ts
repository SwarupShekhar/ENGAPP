import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ChatModule } from '../modules/chat/chat.module';
import { LivekitModule } from '../modules/livekit/livekit.module';
import { SessionsQueuesModule } from '../queues/sessions-queues.module';
import { RedisModule } from '../redis/redis.module';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { MetricsCollectorService } from './metrics-collector.service';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [SessionsQueuesModule, RedisModule, ChatModule, LivekitModule],
  controllers: [MetricsController],
  providers: [MetricsCollectorService],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');
  }
}
