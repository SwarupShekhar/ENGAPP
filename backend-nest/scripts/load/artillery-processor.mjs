/** Rotate Clerk JWTs across VUs for read-heavy load tests. */
export function beforeScenario(context, events, done) {
  let tokens = [];
  try {
    tokens = JSON.parse(process.env.ARTILLERY_CLERK_TOKENS_JSON || '[]');
  } catch {
    return done(new Error('Invalid ARTILLERY_CLERK_TOKENS_JSON'));
  }
  if (tokens.length === 0) {
    return done(new Error('Set ARTILLERY_CLERK_BEARER_TOKEN in .env'));
  }
  const idx = (context.vars.$scenarioIndex ?? 0) + (context.vars.$uuid?.length ?? 0);
  context.vars.clerkToken = tokens[idx % tokens.length];
  return done();
}
