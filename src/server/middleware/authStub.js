'use strict';

// ---------------------------------------------------------------------------
// Auth stub — Session 3 / community beta.
// In Session 4 this validates tokens against Supabase.
//
// Tier detection:
//   Authorization: Bearer <token>
//     → token in PAID_TOKENS → 'paid'
//     → unknown token        → 'free'
//   No Authorization header  → 'free'
//
// Beta tokens are set via the BETA_TOKENS environment variable:
//   BETA_TOKENS=code-alpha,code-bravo,code-charlie
//
// Local dev: 'dev-token-paid' always works outside production.
// ---------------------------------------------------------------------------

// Read beta tokens from env (comma-separated, set in Railway / .env)
const envTokens = (process.env.BETA_TOKENS || '')
  .split(',')
  .map(t => t.trim())
  .filter(Boolean);

const PAID_TOKENS = new Set([
  ...envTokens,
  // Local dev token — disabled in production
  ...(process.env.NODE_ENV !== 'production' ? ['dev-token-paid'] : []),
]);

function detectTier(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (PAID_TOKENS.has(token)) return 'paid';
  }
  return 'free';
}

// ---------------------------------------------------------------------------
// IP extraction — Railway (and most cloud hosts) sit behind multiple proxy
// hops. req.ip collapses to the internal load-balancer address so every user
// looks like the same IP. Read X-Forwarded-For directly and take the leftmost
// entry, which is the real client IP added by the outermost public proxy.
// ---------------------------------------------------------------------------

function getClientIP(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// ---------------------------------------------------------------------------
// Daily scenario cap (in-memory; resets at local midnight / on server restart).
// The beta access-code UI was removed, so every visitor is treated as 'free'
// and gets this generous cap — plenty for the small beta-tester pool while
// still bounding runaway cost. (The Bearer-token 'paid' path below is retained
// as a dev escape hatch but is no longer reachable from the UI.)
// ---------------------------------------------------------------------------

const FREE_DAILY_LIMIT = 50;

// ip → { count: number, date: string }
const freeUsage = new Map();

function _entry(ip) {
  const today = new Date().toDateString();
  let entry = freeUsage.get(ip);
  if (!entry || entry.date !== today) {
    entry = { count: 0, date: today };
    freeUsage.set(ip, entry);
  }
  return entry;
}

function checkFreeLimit(ip) {
  return _entry(ip).count < FREE_DAILY_LIMIT;
}

function incrementFreeUsage(ip) {
  _entry(ip).count++;
}

function getFreeUsageCount(ip) {
  return _entry(ip).count;
}

module.exports = {
  detectTier,
  getClientIP,
  checkFreeLimit,
  incrementFreeUsage,
  getFreeUsageCount,
  FREE_DAILY_LIMIT,
};
