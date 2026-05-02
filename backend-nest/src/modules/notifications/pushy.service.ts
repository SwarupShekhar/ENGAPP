import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface PushPayload {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface SendResult {
  token: string;
  success: boolean;
  error?: string;
  invalidToken?: boolean;
}

@Injectable()
export class PushyService {
  private readonly logger = new Logger(PushyService.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('PUSHY_API_KEY') ?? '';
  }

  async send(tokens: string[], payload: PushPayload): Promise<SendResult[]> {
    return Promise.all(tokens.map((token) => this.sendOne(token, payload)));
  }

  private async sendOne(token: string, payload: PushPayload): Promise<SendResult> {
    try {
      await axios.post(
        `https://api.pushy.me/push?api_key=${this.apiKey}`,
        {
          to: token,
          notification: {
            title: payload.title,
            body: payload.body,
            badge: 1,
            sound: 'default',
          },
          data: payload.data,
        },
        { timeout: 5000 },
      );
      return { token, success: true };
    } catch (err) {
      const errorMsg: string = (err as any)?.response?.data?.error ?? (err as Error)?.message ?? 'unknown';
      const isInvalid =
        errorMsg.includes('DeviceNotRegistered') ||
        errorMsg.includes('InvalidToken') ||
        errorMsg.includes('NotRegistered');
      this.logger.warn(`[Pushy] Send failed for token ...${token.slice(-6)}: ${errorMsg}`);
      return { token, success: false, error: errorMsg, invalidToken: isInvalid };
    }
  }
}
