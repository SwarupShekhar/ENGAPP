import { Injectable } from '@nestjs/common';
import { BrainService } from './modules/brain/brain.service';

@Injectable()
export class AppService {
  constructor(private brainService: BrainService) {}

  getHello(): string {
    return 'Hello EngR App!';
  }

  getHealth(): {
    status: string;
    timestamp: number;
    services: {
      aiEngine: {
        healthy: boolean;
        url: string;
        lastCheck: Date | null;
        consecutiveFailures: number;
      };
    };
  } {
    const aiStatus = this.brainService.getAiEngineStatus();

    return {
      status: aiStatus.healthy ? 'healthy' : 'degraded',
      timestamp: Date.now(),
      services: {
        aiEngine: aiStatus,
      },
    };
  }
}
