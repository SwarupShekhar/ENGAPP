import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class MuxService {
  private readonly logger = new Logger(MuxService.name);
  private readonly signingKeyId: string;
  private readonly privateKey: string;

  constructor(private configService: ConfigService) {
    this.signingKeyId = this.configService.get<string>('MUX_SIGNING_KEY_ID');
    // The private key should be in PEM format (with headers)
    this.privateKey = this.configService
      .get<string>('MUX_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');
  }

  /**
   * Generates a signed playback URL for a Mux video.
   * Uses RS256 algorithm to sign a JWT for the playback ID.
   */
  generateSignedPlayback(playbackId: string): string {
    if (!this.signingKeyId || !this.privateKey) {
      this.logger.warn(
        'Mux signing credentials missing. Returning unsigned URL.',
      );
      return `https://stream.mux.com/${playbackId}.m3u8`;
    }

    try {
      const header = {
        alg: 'RS256',
        typ: 'JWT',
        kid: this.signingKeyId,
      };

      const now = Math.floor(Date.now() / 1000);
      const payload = {
        sub: playbackId,
        aud: 'v', // 'v' for video, 't' for thumbnail, etc.
        exp: now + 600, // 10 minute expiry as requested
      };

      const token = this.signJwt(header, payload);
      return `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
    } catch (error) {
      this.logger.error(`Error generating Mux signed URL: ${error.message}`);
      return `https://stream.mux.com/${playbackId}.m3u8`;
    }
  }

  private signJwt(header: any, payload: any): string {
    const base64Header = Buffer.from(JSON.stringify(header)).toString(
      'base64url',
    );
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const input = `${base64Header}.${base64Payload}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(input);
    const signature = signer.sign(this.privateKey, 'base64url');

    return `${input}.${signature}`;
  }
}
