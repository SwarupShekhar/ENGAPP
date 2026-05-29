import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class PosthogAnalyticsService {
  private readonly logger = new Logger(PosthogAnalyticsService.name);
  private readonly apiKey: string;
  private readonly host: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('POSTHOG_API_KEY')?.trim() ?? '';
    const configuredHost = this.config.get<string>('POSTHOG_HOST')?.trim();
    this.host = (configuredHost || 'https://us.i.posthog.com').replace(/\/$/, '');
  }

  isEnabled(): boolean {
    return this.apiKey.length > 0;
  }

  /** Fire-and-forget server-side product analytics (same PostHog project as mobile). */
  capture(
    event: string,
    distinctId: string,
    properties?: Record<string, unknown>,
  ): void {
    if (!this.isEnabled()) return;

    void this.sendCapture(event, distinctId, properties).catch((err) => {
      this.logger.debug(
        `[PostHog] capture failed for ${event}: ${(err as Error).message}`,
      );
    });
  }

  private async sendCapture(
    event: string,
    distinctId: string,
    properties?: Record<string, unknown>,
  ): Promise<void> {
    await axios.post(
      `${this.host}/capture/`,
      {
        api_key: this.apiKey,
        event,
        distinct_id: distinctId,
        properties: {
          source: 'backend-nest',
          environment: this.config.get<string>('NODE_ENV') ?? 'unknown',
          ...(properties ?? {}),
        },
      },
      { timeout: 4000, validateStatus: (s) => s >= 200 && s < 300 },
    );
  }
}
