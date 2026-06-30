#!/usr/bin/env node
/**
 * Verify a Clerk session JWT and optionally write ARTILLERY_CLERK_BEARER_TOKEN to .env
 *
 * Usage:
 *   npm run load:verify-clerk-token -- eyJhbGciOi...
 *   npm run load:verify-clerk-token -- eyJhbGciOi... --write-env
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

loadEnvFile(join(repoRoot, '.env'));
loadEnvFile(join(repoRoot, 'backend-nest', '.env'));

const args = process.argv.slice(2).filter((a) => a !== '--write-env');
const writeEnv = process.argv.includes('--write-env');
const jwt = (args[0] ?? '').replace(/^Bearer\s+/i, '').trim();

if (!jwt || !jwt.startsWith('eyJ')) {
  console.error('Usage: npm run load:verify-clerk-token -- eyJ... [--write-env]');
  process.exit(1);
}

const nestTarget = process.env.ARTILLERY_NEST_TARGET || 'https://api.englivo.com';
const base = nestTarget.replace(/\/$/, '');

async function probe(path) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  return res.status;
}

async function main() {
  const home = await probe('/home');
  const mm = await probe('/matchmaking/status?level=B1');
  console.log(`GET /home → HTTP ${home}`);
  console.log(`GET /matchmaking/status → HTTP ${mm}`);

  if (home !== 200) {
    console.error('\nToken rejected or expired. Sign in again in the app and copy a fresh JWT.');
    process.exit(1);
  }

  console.log('\nToken works for load tests.');
  if (writeEnv) {
    const envPath = join(repoRoot, '.env');
    let text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    if (/^ARTILLERY_CLERK_BEARER_TOKEN=/m.test(text)) {
      text = text.replace(/^ARTILLERY_CLERK_BEARER_TOKEN=.*$/m, `ARTILLERY_CLERK_BEARER_TOKEN=${jwt}`);
    } else {
      text += `\nARTILLERY_CLERK_BEARER_TOKEN=${jwt}\n`;
    }
    writeFileSync(envPath, text);
    console.log(`Wrote ARTILLERY_CLERK_BEARER_TOKEN to ${envPath}`);
  } else {
    console.log('\nAdd to .env:');
    console.log(`ARTILLERY_CLERK_BEARER_TOKEN=${jwt}`);
    console.log('\nOr re-run with --write-env');
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
