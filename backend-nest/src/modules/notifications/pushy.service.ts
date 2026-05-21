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
    this.apiKey = resolvePushyApiKey(config);
    if (!this.apiKey.trim()) {
      this.logger.warn(
        '[Pushy] No API key (set PUSHY_API_KEY or PUSHY_ME_API_KEY in backend-nest/.env); skipping push delivery',
      );
    }
  }

  hasValidConfig(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async send(tokens: string[], payload: PushPayload): Promise<SendResult[]> {
    if (!this.apiKey.trim()) {
      return tokens.map((token) => ({
        token,
        success: false,
        error: 'Pushy API key not configured',
      }));
    }
    return Promise.all(tokens.map((token) => this.sendOne(token, payload)));
  }

  private async sendOne(token: string, payload: PushPayload): Promise<SendResult> {
    if (!this.apiKey.trim()) {
      return { token, success: false, error: 'Pushy API key not configured' };
    }
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
          data: {
            ...payload.data,
            title: payload.title,
            body: payload.body,
            message: payload.body,
          },
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

/** Nest reads PUSHY_API_KEY; some deployments use PUSHY_ME_API_KEY from the Pushy dashboard label. */
export function resolvePushyApiKey(config: ConfigService): string {
  const primary = config.get<string>('PUSHY_API_KEY')?.trim() ?? '';
  if (primary) return primary;
  return config.get<string>('PUSHY_ME_API_KEY')?.trim() ?? '';
}
