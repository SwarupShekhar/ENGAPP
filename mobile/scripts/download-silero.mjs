#!/usr/bin/env node
/**
 * Downloads Silero VAD v5 ONNX model into mobile/assets/models/silero_vad.onnx.
 * Run once before building the dev client (or whenever the model is missing).
 *
 *   node scripts/download-silero.mjs
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const targetDir = join(__dirname, '..', 'assets', 'models');
const target = join(targetDir, 'silero_vad.onnx');

// Official Silero VAD v5 ONNX model (~1.7 MB).
const URL =
  'https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const req = get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      const out = createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function main() {
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  if (existsSync(target)) {
    const size = statSync(target).size;
    if (size > 1_000_000) {
      console.log(`silero_vad.onnx already present (${size} bytes). Skipping.`);
      return;
    }
    console.log('Existing silero_vad.onnx looks truncated; re-downloading.');
  }

  console.log(`Downloading Silero VAD model -> ${target}`);
  await download(URL, target);
  const size = statSync(target).size;
  console.log(`Done (${size} bytes).`);
}

main().catch((err) => {
  console.error('Silero VAD download failed:', err);
  process.exit(1);
});
