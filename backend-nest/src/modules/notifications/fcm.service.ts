import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { resolveFirebaseServiceAccount } from './firebase-credentials';
import type { PushPayload, SendResult } from './push-payload';

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private configured = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (admin.apps.length > 0) {
      this.configured = true;
      return;
    }

    const serviceAccount = resolveFirebaseServiceAccount(this.config);
    if (!serviceAccount) {
      this.logger.warn(
        '[FCM] No service account (set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON); push delivery disabled',
      );
      return;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    this.configured = true;
    this.logger.log('[FCM] Firebase Admin initialized');
  }

  hasValidConfig(): boolean {
    return this.configured;
  }

  async send(tokens: string[], payload: PushPayload): Promise<SendResult[]> {
    if (!this.configured) {
      return tokens.map((token) => ({
        token,
        success: false,
        error: 'FCM not configured',
      }));
    }

    if (!tokens.length) return [];

    const data = this.stringifyData({
      ...payload.data,
      title: payload.title,
      body: payload.body,
      message: payload.body,
    });

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'englivo_default',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      });

      return response.responses.map((result, index) => {
        const token = tokens[index];
        if (result.success) {
          return { token, success: true };
        }
        const code = result.error?.code ?? 'unknown';
        const errorMsg = result.error?.message ?? code;
        if (!result.success) {
          this.logger.warn(`[FCM] Send failed for token ...${token.slice(-6)}: ${errorMsg}`);
        }
        return {
          token,
          success: false,
          error: errorMsg,
          invalidToken: INVALID_TOKEN_CODES.has(code),
        };
      });
    } catch (err) {
      const errorMsg = (err as Error)?.message ?? 'unknown';
      this.logger.error(`[FCM] Multicast failed: ${errorMsg}`);
      return tokens.map((token) => ({
        token,
        success: false,
        error: errorMsg,
      }));
    }
  }

  private stringifyData(data: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;
      out[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return out;
  }
}
