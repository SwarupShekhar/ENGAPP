#!/usr/bin/env node
/**
 * Mint ARTILLERY_CLERK_BEARER_TOKEN via Clerk Backend API.
 *
 * Usage:
 *   node scripts/load/mint-clerk-token.mjs user_3BhmUndpZnTcPQPzGCWIE3DWRcn
 *   node scripts/load/mint-clerk-token.mjs user_3BhmUndpZnTcPQPzGCWIE3DWRcn --write-env
 *
 * Reads CLERK_SECRET_KEY from repo-root .env or backend-nest/.env
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

const userId = process.argv[2];
const writeEnv = process.argv.includes('--write-env');
const debug = process.argv.includes('--debug');
const expiresSec = Number(process.env.ARTILLERY_TOKEN_EXPIRES_SEC ?? 3600);

if (!userId || !userId.startsWith('user_')) {
  console.error('Usage: node scripts/load/mint-clerk-token.mjs user_xxx [--write-env]');
  process.exit(1);
}

const secret = process.env.CLERK_SECRET_KEY;
if (!secret) {
  console.error('CLERK_SECRET_KEY not found in .env');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${secret}`,
  'Content-Type': 'application/json',
};

async function clerk(path, init = {}) {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return body;
}

async function listSessions(userId, { status } = {}) {
  const q = status ? `?status=${status}&limit=10` : '?limit=10';
  const paths = [
    `/users/${encodeURIComponent(userId)}/sessions${q}`,
    `/sessions?user_id=${encodeURIComponent(userId)}${status ? `&status=${status}` : ''}&limit=10`,
  ];
  const errors = [];
  for (const path of paths) {
    try {
      const list = await clerk(path);
      const sessions = Array.isArray(list) ? list : list.data ?? [];
      if (sessions.length > 0 || debug) {
        return { sessions, path };
      }
    } catch (e) {
      errors.push(`${path}: ${e.message}`);
    }
  }
  if (debug && errors.length) console.warn('Session list errors:\n', errors.join('\n'));
  return { sessions: [], path: null };
}

async function main() {
  const isLive = secret.startsWith('sk_live_');
  const clerkEnv = isLive ? 'production (sk_live)' : 'development (sk_test)';

  console.log(`Clerk API: ${clerkEnv}`);
  console.log(`User ID:   ${userId}\n`);

  try {
    const user = await clerk(`/users/${encodeURIComponent(userId)}`);
    console.log(
      `User found: ${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() ||
        `User found: ${user.id}`,
    );
    if (user.last_sign_in_at) {
      console.log(`Last sign-in: ${user.last_sign_in_at}`);
    } else {
      console.warn('Last sign-in: never — this user has not signed in on THIS Clerk instance.');
    }
  } catch (e) {
    console.error(
      `\nUser not found on ${clerkEnv} Clerk.\n` +
        `Your mobile app may be using a different Clerk instance (dev pk_test vs live pk_live).\n` +
        `Dashboard user ID must match CLERK_SECRET_KEY in .env.\n` +
        `Error: ${e.message}`,
    );
    process.exit(1);
  }

  const { sessions: allSessions } = await listSessions(userId);
  if (debug || allSessions.length === 0) {
    console.log(`\nSessions (any status): ${allSessions.length}`);
    for (const s of allSessions.slice(0, 5)) {
      console.log(`  - ${s.id}  status=${s.status}  last_active=${s.last_active_at ?? 'n/a'}`);
    }
  }

  const activeSessions = allSessions.filter((s) => s.status === 'active');
  let sessionId = activeSessions[0]?.id;

  if (!isLive && !sessionId) {
    try {
      const session = await clerk('/sessions', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      });
      sessionId = session.id;
      console.log(`Created session: ${sessionId}`);
    } catch (e) {
      console.warn(`Create session failed: ${e.message}`);
    }
  } else {
    console.log('Production Clerk — cannot create sessions via API (dev-only).');
  }

  if (!sessionId) {
    sessionId = activeSessions[0]?.id;
    if (sessionId) console.log(`Using active session: ${sessionId}`);
  }

  if (!sessionId) {
    console.error(`
No active Clerk session for ${userId} on ${clerkEnv}.

Most common causes:
  1) Not signed in on the app yet (on the SAME Clerk instance as .env CLERK_SECRET_KEY).
  2) Dev app uses pk_test fallback (bright-basilisk-91) but .env has sk_live (englivo.com).
     Fix: set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_... in mobile/.env, rebuild, sign in again.
  3) Signed in as a different user than user_3BhmUndpZnTcPQPzGCWIE3DWRcn.

What to do:
  A) Profile → Socket Debug → "Show load-test JWT" → copy eyJ...
     npm run load:verify-clerk-token -- eyJ... --write-env

  B) Sign in on app, then re-run:
     npm run load:mint-clerk-token -- ${userId} --write-env

  C) Clerk Dashboard → Users → Impersonate → sign in on app → re-run (B).

Debug: npm run load:mint-clerk-token -- ${userId} --debug
`);
    process.exit(1);
  }

  const token = await clerk(`/sessions/${sessionId}/tokens`, {
    method: 'POST',
    body: JSON.stringify({ expires_in_seconds: expiresSec }),
  });

  const jwt = token.jwt;
  if (!jwt) {
    throw new Error('No jwt in Clerk response');
  }

  const nestTarget = process.env.ARTILLERY_NEST_TARGET || 'https://api.englivo.com';
  const verify = await fetch(`${nestTarget.replace(/\/$/, '')}/home`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  console.log(`Verify GET /home → HTTP ${verify.status}`);

  console.log('\nAdd to .env:\n');
  console.log(`ARTILLERY_CLERK_BEARER_TOKEN=${jwt}\n`);
  console.log(`(expires in ~${expiresSec}s — re-run before long load tests)\n`);

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
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
