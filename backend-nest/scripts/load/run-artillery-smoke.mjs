#!/usr/bin/env node
/**
 * Phase 0 Artillery smoke test.
 * Loads ARTILLERY_* vars from repo-root .env, preflights targets, runs test, archives JSON report.
 */
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');
const loadDir = __dirname;
const resultsDir = join(loadDir, 'results');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
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

const nestTarget =
  process.env.ARTILLERY_NEST_TARGET || 'https://api.englivo.com';
const aiTarget =
  process.env.ARTILLERY_AI_TARGET || 'http://139.84.163.249:4002';

process.env.ARTILLERY_NEST_TARGET = nestTarget.replace(/\/$/, '');
process.env.ARTILLERY_AI_TARGET = aiTarget.replace(/\/$/, '');

// Artillery Cloud reads ARTILLERY_CLOUD_API_KEY (not ARTILLERY_API_KEY).
if (!process.env.ARTILLERY_CLOUD_API_KEY && process.env.ARTILLERY_API_KEY) {
  process.env.ARTILLERY_CLOUD_API_KEY = process.env.ARTILLERY_API_KEY;
}
const cloudKey = process.env.ARTILLERY_CLOUD_API_KEY;

function preflight(label, url) {
  try {
    const res = spawnSync(
      'curl',
      ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '15', url],
      { encoding: 'utf8' },
    );
    const code = (res.stdout || '').trim();
    const ok = code === '200';
    console.log(`${ok ? '✓' : '✗'} ${label} ${url} → HTTP ${code || 'timeout'}`);
    return ok;
  } catch {
    console.log(`✗ ${label} ${url} → error`);
    return false;
  }
}

console.log('Preflight…');
const nestOk = preflight('Nest', `${process.env.ARTILLERY_NEST_TARGET}/health`);
const aiOk = preflight('AI', `${process.env.ARTILLERY_AI_TARGET}/api/health`);

if (!nestOk) {
  console.error(
    '\nNest health unreachable. Set ARTILLERY_NEST_TARGET in .env or start the API.',
  );
  process.exit(1);
}

if (!aiOk) {
  console.warn(
    '\nAI health unreachable from this host — Nest-only smoke.',
    '\nTip: run from Vultr or open port 4002 for dual-target smoke.',
  );
}

const skipAi = process.env.ARTILLERY_SKIP_AI === '1' || !aiOk;

mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const reportJson = join(resultsDir, `smoke-${stamp}.json`);
const yml = join(loadDir, 'artillery-smoke.yml');

const args = ['artillery@latest', 'run', '--output', reportJson, yml];
if (skipAi) {
  args.push('--scenario-name', 'Nest GET /health');
}

const useCloud =
  cloudKey && process.env.ARTILLERY_NO_RECORD !== '1';
if (useCloud) {
  args.push('--record', '--key', cloudKey);
  console.log('\nRecording to Artillery Cloud…');
} else if (!cloudKey) {
  console.warn('\nARTILLERY_CLOUD_API_KEY not set — local report only.');
} else {
  console.log('\nARTILLERY_NO_RECORD=1 — local report only.');
}

function runArtillery(extraArgs) {
  return spawnSync('npx', [...args, ...extraArgs], {
    stdio: 'pipe',
    env: process.env,
    cwd: loadDir,
    encoding: 'utf8',
  });
}

console.log(`\nRunning smoke (60s)…\n`);
let run = runArtillery([]);
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);

if (run.status !== 0 && useCloud) {
  const out = `${run.stdout}\n${run.stderr}`;
  if (/API key|401|403|unauthorized|expired/i.test(out)) {
    console.warn(
      '\nArtillery Cloud recording failed (key may be expired). Retrying local-only…',
    );
    const localArgs = args.filter((a, i) => {
      if (a === '--record' || a === '--key') return false;
      if (i > 0 && args[i - 1] === '--key') return false;
      return true;
    });
    run = spawnSync('npx', localArgs, {
      stdio: 'inherit',
      env: process.env,
      cwd: loadDir,
    });
  } else {
    process.exit(run.status ?? 1);
  }
} else if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

console.log(`\nReports: ${reportJson}`);
console.log('View in Artillery Cloud when --record was used (see Run URL above).');
