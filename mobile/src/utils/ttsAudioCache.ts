import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

const CACHE_PREFIX = 'tts_cache_';

async function cacheKey(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

/**
 * Returns a local file URI for TTS audio. Uses disk cache keyed by `keyInput`
 * (e.g. JSON.stringify(narration payload)) to avoid repeat network + base64 writes.
 */
export async function getOrFetchTtsFileUri(
  keyInput: string,
  fetchBase64: () => Promise<string>,
): Promise<string | null> {
  const key = await cacheKey(keyInput);
  const path = `${FileSystem.cacheDirectory}${CACHE_PREFIX}${key}.mp3`;
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) return path;

  const b64 = await fetchBase64();
  if (!b64) return null;

  await FileSystem.writeAsStringAsync(path, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

/** Fire-and-forget prefetch; ignores errors. */
export function prefetchTtsFileUri(
  keyInput: string,
  fetchBase64: () => Promise<string>,
): void {
  void getOrFetchTtsFileUri(keyInput, fetchBase64).catch(() => {});
}
