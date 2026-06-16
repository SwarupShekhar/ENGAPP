import { ConfigService } from '@nestjs/config';

/** Headers for server-to-server calls into backend-ai (x-api-key). */
export function aiEngineAuthHeaders(
  config: ConfigService,
): Record<string, string> {
  const key = config.get<string>('INTERNAL_API_KEY');
  return key ? { 'x-api-key': key } : {};
}
