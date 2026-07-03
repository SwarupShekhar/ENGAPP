export function isScoreAuthorityEnabled(userId?: string): boolean {
  const globalOn = process.env.SCORES_AUTHORITY_V1 === 'true';
  const raw = process.env.SCORES_AUTHORITY_V1_USER_IDS?.trim();
  if (raw) {
    const allowlist = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (allowlist.length > 0) {
      return userId ? allowlist.includes(userId) : false;
    }
  }
  return globalOn;
}
