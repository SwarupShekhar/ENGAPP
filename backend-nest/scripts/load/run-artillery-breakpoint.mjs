#!/usr/bin/env node
/**
 * Ramp load test to find where Nest starts failing.
 * Default: GET /health only. Pass --read for authed /home + matchmaking mix.
 */
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const loadDir = __dirname;
const repoRoot = join(__dirname, '../../..');
const resultsDir = join(loadDir, 'results');

const readMode = process.argv.includes('--read');

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

const nestTarget =
  process.env.ARTILLERY_NEST_TARGET || 'https://api.englivo.com';
process.env.ARTILLERY_NEST_TARGET = nestTarget.replace(/\/$/, '');

if (!process.env.ARTILLERY_CLOUD_API_KEY && process.env.ARTILLERY_API_KEY) {
  process.env.ARTILLERY_CLOUD_API_KEY = process.env.ARTILLERY_API_KEY;
}
const cloudKey = process.env.ARTILLERY_CLOUD_API_KEY;

function collectClerkTokens() {
  const tokens = [];
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('ARTILLERY_CLERK_BEARER_TOKEN') || !v) continue;
    const t = v.replace(/^Bearer\s+/i, '').trim();
    if (t) tokens.push(t);
  }
  return tokens;
}

const clerkTokens = collectClerkTokens();
if (readMode && clerkTokens.length === 0) {
  console.error(
    'Read-heavy mode needs ARTILLERY_CLERK_BEARER_TOKEN in .env (Clerk session JWT).',
  );
  console.error('Run health-only first: npm run load:breakpoint');
  process.exit(1);
}

// Passed into Artillery processor via env JSON hack — processor reads process.env in beforeScenario
process.env.ARTILLERY_TOKEN_COUNT = String(clerkTokens.length);

mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const label = readMode ? 'phase1-read' : 'breakpoint-health';
const reportJson = join(resultsDir, `${label}-${stamp}.json`);
const yml = join(
  loadDir,
  readMode ? 'artillery-phase1-read.yml' : 'artillery-breakpoint-health.yml',
);

const args = [
  'artillery@latest',
  'run',
  '--output',
  reportJson,
  yml,
  '--name',
  `engr-${label}-${stamp}`,
];

const useCloud =
  cloudKey && process.env.ARTILLERY_NO_RECORD !== '1';
if (useCloud) {
  args.push('--record', '--key', cloudKey);
}

console.log(`Target: ${process.env.ARTILLERY_NEST_TARGET}`);
console.log(`Mode:   ${readMode ? 'read-heavy (authed)' : 'health breakpoint'}`);
if (readMode) {
  console.log(`Tokens: ${clerkTokens.length} Clerk JWT(s)`);
}
console.log(`\nRamp test running (~3–4 min)…\n`);

const run = spawnSync('npx', args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    ARTILLERY_CLERK_TOKENS_JSON: JSON.stringify(clerkTokens),
  },
  cwd: loadDir,
});

if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

if (!existsSync(reportJson)) {
  console.error('No report JSON produced.');
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportJson, 'utf8'));
const summary = analyzeBreakpoint(report, readMode);
const summaryPath = join(resultsDir, `${label}-${stamp}-summary.md`);
writeFileSync(summaryPath, summary.markdown);

console.log('\n' + '='.repeat(60));
console.log(summary.console);
console.log('='.repeat(60));
console.log(`\nFull report: ${reportJson}`);
console.log(`Summary:     ${summaryPath}`);

function analyzeBreakpoint(data, authed) {
  const agg = data.aggregate ?? {};
  const counters = agg.counters ?? {};
  const rt = agg.summaries?.['http.response_time'] ?? {};
  const requests = counters['http.requests'] ?? 0;
  const responses = counters['http.responses'] ?? 0;
  const failed = counters['vusers.failed'] ?? 0;
  const codes200 = counters['http.codes.200'] ?? 0;
  const codes401 = counters['http.codes.401'] ?? 0;
  const codes429 = counters['http.codes.429'] ?? 0;
  const codes5xx =
    (counters['http.codes.500'] ?? 0) +
    (counters['http.codes.502'] ?? 0) +
    (counters['http.codes.503'] ?? 0) +
    (counters['http.codes.504'] ?? 0);
  const timeouts = counters['errors.ETIMEDOUT'] ?? 0;
  const socketTimeouts = counters['errors.ERR_SOCKET_TIMEOUT'] ?? 0;
  const errorTotal = failed + codes5xx + timeouts + socketTimeouts;
  const errorRate = requests > 0 ? (errorTotal / requests) * 100 : 0;

  const periods = (data.intermediate ?? [])
    .map((p) => {
      const c = p.counters ?? {};
      const s = p.summaries?.['http.response_time'] ?? {};
      const req = c['http.requests'] ?? 0;
      const res = c['http.responses'] ?? 0;
      const fail = c['vusers.failed'] ?? 0;
      const r429 = c['http.codes.429'] ?? 0;
      const r5 =
        (c['http.codes.500'] ?? 0) +
        (c['http.codes.502'] ?? 0) +
        (c['http.codes.503'] ?? 0);
      const err = fail + r5 + (c['errors.ERR_SOCKET_TIMEOUT'] ?? 0);
      const rate = c['http.request_rate'] ?? null;
      const meanMs = s.mean ?? 0;
      const p95 = s.p95 ?? s.median ?? 0;
      const concurrentEst =
        rate != null && meanMs > 0
          ? Math.round(rate * (meanMs / 1000))
          : null;
      return {
        at: p.period ?? null,
        requestRate: rate,
        requests: req,
        responses: res,
        errors: err,
        r429,
        errorPct: req > 0 ? (err / req) * 100 : 0,
        p95,
        meanMs,
        concurrentEst,
      };
    })
    .filter((p) => p.requests > 0);

  const breach = periods.find(
    (p) => p.errorPct > 5 || p.p95 > 2000 || p.r429 > 0,
  );
  const peak = periods.reduce(
    (best, p) =>
      (p.requestRate ?? 0) > (best.requestRate ?? 0) ? p : best,
    {},
  );
  const lastStable = breach
    ? periods
        .filter((p) => (p.at ?? 0) < (breach.at ?? Infinity))
        .reduce((best, p) => ((p.requestRate ?? 0) > (best.requestRate ?? 0) ? p : best), {})
    : peak;

  const meanMs = rt.mean ?? 0;
  const peakConcurrent =
    peak.requestRate != null && meanMs > 0
      ? Math.round(peak.requestRate * (meanMs / 1000))
      : null;

  const consoleLines = [
    `BREAKPOINT ANALYSIS (${authed ? 'read-heavy' : 'health only'})`,
    `Total requests: ${requests} | 200: ${codes200} | 401: ${codes401} | 429: ${codes429} | 5xx: ${codes5xx}`,
    `Failures: ${failed} | Timeouts: ${timeouts + socketTimeouts} | Error rate: ${errorRate.toFixed(1)}%`,
    `Overall p95: ${rt.p95 ?? 'n/a'} ms | median: ${rt.median ?? 'n/a'} ms`,
    '',
    breach
      ? `First stress signal ~${breach.requestRate ?? '?'} req/s (p95 ${Math.round(breach.p95)} ms, errors ${breach.errorPct.toFixed(1)}%, 429s ${breach.r429})`
      : 'No clear breakpoint in this ramp — server handled up to ~120 req/s on this endpoint.',
    lastStable.requestRate != null
      ? `Last stable bucket before breach: ~${lastStable.requestRate} req/s (~${lastStable.concurrentEst ?? '?'} est. concurrent)`
      : '',
    peak.requestRate != null
      ? `Peak ramp rate reached: ~${peak.requestRate} req/s (~${peakConcurrent ?? '?'} est. concurrent at mean latency)`
      : '',
    '',
    authed && codes401 > requests * 0.1
      ? 'WARNING: >10% HTTP 401 — Clerk JWT not sent; re-run after fixing artillery-phase1-read.yml or re-mint token.'
      : '',
    authed
      ? '429s indicate throttler limits, not necessarily server melt.'
      : 'Health has no throttler — this is infra/Node capacity. Real users hit /home + DB (lower ceiling).',
    'Add ARTILLERY_CLERK_BEARER_TOKEN and run: npm run load:breakpoint -- --read',
  ].filter(Boolean);

  const md = `# Breakpoint test — ${stamp}

**Mode:** ${authed ? 'read-heavy (home + matchmaking + health)' : 'health only'}  
**Target:** ${process.env.ARTILLERY_NEST_TARGET}

## Aggregate

| Metric | Value |
|--------|-------|
| Total requests | ${requests} |
| HTTP 200 | ${codes200} |
| HTTP 429 | ${codes429} |
| HTTP 5xx | ${codes5xx} |
| Socket/timeouts | ${timeouts + socketTimeouts} |
| Error rate | ${errorRate.toFixed(1)}% |
| p95 latency | ${rt.p95 ?? 'n/a'} ms |
| median latency | ${rt.median ?? 'n/a'} ms |

## Interpretation

${breach ? `- **First stress signal** around **~${breach.requestRate} req/s** (p95 ${Math.round(breach.p95)} ms, ${breach.errorPct.toFixed(1)}% errors)` : '- **No breakpoint** in this ramp (up to ~120 req/s on `/health`).'}
${lastStable.requestRate != null ? `- **Last stable bucket** before breach: ~${lastStable.requestRate} req/s (~${lastStable.concurrentEst ?? '?'} estimated concurrent users)` : ''}
${peak.requestRate != null ? `- **Peak ramp**: ~${peak.requestRate} req/s` : ''}

> **req/s ≠ users.** Concurrent users ≈ req/s × (response time in seconds).  
> Example: 50 req/s × 0.05 s = ~2.5 concurrent connections.

## Per-period (10s buckets)

| req/s | requests | errors% | p95 ms | est. concurrent |
|-------|----------|---------|--------|-----------------|
${periods
  .slice(-20)
  .map(
    (p) =>
      `| ${p.requestRate ?? '-'} | ${p.requests} | ${p.errorPct.toFixed(1)} | ${Math.round(p.p95)} | ${p.concurrentEst ?? '-'} |`,
  )
  .join('\n')}

## JSON report

\`${reportJson.split('/').pop()}\`
`;

  return { console: consoleLines.join('\n'), markdown: md };
}
