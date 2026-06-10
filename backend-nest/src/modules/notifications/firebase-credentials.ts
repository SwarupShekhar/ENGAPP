import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { ConfigService } from '@nestjs/config';
import type { ServiceAccount } from 'firebase-admin';

export function resolveFirebaseServiceAccount(
  config: ConfigService,
): ServiceAccount | null {
  const inlineJson = config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim();
  if (inlineJson) {
    try {
      return JSON.parse(inlineJson) as ServiceAccount;
    } catch {
      return null;
    }
  }

  const configuredPath =
    config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH')?.trim() ??
    config.get<string>('GOOGLE_APPLICATION_CREDENTIALS')?.trim() ??
    '';

  const candidates = [
    configuredPath,
    resolve(process.cwd(), 'config/firebase-service-account.json'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const absolutePath = resolve(candidate);
    if (!existsSync(absolutePath)) continue;
    try {
      return JSON.parse(readFileSync(absolutePath, 'utf8')) as ServiceAccount;
    } catch {
      return null;
    }
  }

  return null;
}
