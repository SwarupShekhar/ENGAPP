import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export interface AiWsTokenPayload {
  sub: string;
  sid: string;
  exp: number;
}

@Injectable()
export class AiWsTokenService {
  constructor(private readonly config: ConfigService) {}

  issue(userId: string, sessionId: string, ttlSeconds = 3600): string {
    const secret = this.config.get<string>('INTERNAL_API_KEY');
    if (!secret) {
      throw new UnauthorizedException('INTERNAL_API_KEY is not configured');
    }
    const payload: AiWsTokenPayload = {
      sub: userId,
      sid: sessionId,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', secret)
      .update(payloadB64)
      .digest('base64url');
    return `${payloadB64}.${sig}`;
  }

  verify(token: string): AiWsTokenPayload {
    const secret = this.config.get<string>('INTERNAL_API_KEY');
    if (!secret) {
      throw new UnauthorizedException('INTERNAL_API_KEY is not configured');
    }
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new UnauthorizedException('Invalid streaming token');
    }
    const [payloadB64, sig] = parts;
    const expected = createHmac('sha256', secret)
      .update(payloadB64)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (
      sigBuf.length !== expectedBuf.length ||
      !timingSafeEqual(sigBuf, expectedBuf)
    ) {
      throw new UnauthorizedException('Invalid streaming token signature');
    }
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as AiWsTokenPayload;
    if (!payload.sub || !payload.sid || !payload.exp) {
      throw new UnauthorizedException('Invalid streaming token payload');
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Streaming token expired');
    }
    return payload;
  }
}
