import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello EngR App!';
  }

  getHealth(): { status: string; timestamp: number } {
    return {
      status: 'healthy',
      timestamp: Date.now(),
    };
  }
}