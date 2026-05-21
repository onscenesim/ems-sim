'use strict';

const { v4: uuidv4 } = require('uuid');
const { Session }     = require('../engine/session');
const { rollScenario } = require('../engine/roller');
const { RATE_LIMITS, HISTORY_WINDOWS } = require('../data/config');

const TTL_MS = 4 * 60 * 60 * 1000; // 4 hours of inactivity (free tier); paid/beta sessions never expire

// id → { session: Session, lastActive: number, userId: string, tier: string }
const store = new Map();

// userId → { categories[], presentations[], crew[], doa_positions[], arrest_positions[], total_count }
// Tracks per-user scenario history so the roller can avoid repeats.
// Keyed by IP for free users; would be keyed by auth user id for paid users.
const userHistory = new Map();

// Prune expired free-tier sessions every 5 minutes; paid sessions never expire.
setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, entry] of store) {
    if (entry.tier !== 'paid' && entry.lastActive < cutoff) store.delete(id);
  }
}, 5 * 60 * 1000);

/**
 * Get or initialise the history record for a user.
 */
function getOrInitHistory(userId) {
  if (!userHistory.has(userId)) {
    userHistory.set(userId, {
      categories:      [],
      presentations:   [],
      crew:            [],
      doa_positions:   [],
      arrest_positions: [],
      total_count:     0,
    });
  }
  return userHistory.get(userId);
}

/**
 * Update history after a scenario is rolled.
 * Respects the tier's history_stored cap.
 */
function updateHistory(userId, seed, tier) {
  const h = getOrInitHistory(userId);
  const cap = (RATE_LIMITS[tier.toUpperCase()] || RATE_LIMITS.FREE).history_stored;

  h.categories.push(seed.category);
  if (h.categories.length > HISTORY_WINDOWS.category) h.categories.shift();

  const pKey = seed.presentation;
  h.presentations.push(pKey);
  // Cap stored presentation history to the config window (or tier cap if smaller)
  const presWindow = Math.min(HISTORY_WINDOWS.presentation, cap);
  if (h.presentations.length > presWindow) h.presentations.shift();

  if (seed.crew_partner) h.crew.push(seed.crew_partner);
  if (seed.crew_captain) h.crew.push(seed.crew_captain);
  if (h.crew.length > HISTORY_WINDOWS.crew * 2) h.crew.splice(0, 2);

  if (seed.category === 'doa') h.doa_positions.push(h.total_count);
  if (seed.category === 'arrest') h.arrest_positions.push(h.total_count);

  h.total_count += 1;
}

/**
 * Roll a new scenario, wrap it in a Session, and persist it.
 * Returns { id, seed }.
 */
function createSession({ difficulty = 'NORMAL', provider_level = 'ALS', region_id = 'SUBURBAN', unit_name = 'Medic 1' } = {}, userId = 'anon', tier = 'free') {
  const history = getOrInitHistory(userId);

  const seed = rollScenario({
    difficulty,
    provider_level,
    region_id,
    unit_name,
    user_id: userId,
    history,
  });

  // Record this scenario in the user's history so future rolls avoid repeats
  updateHistory(userId, seed, tier);

  const id = uuidv4();
  const session = new Session(seed, id);   // pass id so session can reference itself in run logs
  store.set(id, { session, lastActive: Date.now(), userId, tier });
  return { id, seed };
}

/**
 * Retrieve a session by ID and refresh its TTL.
 * Returns the Session object, or null if not found / expired.
 */
function getSession(id) {
  const entry = store.get(id);
  if (!entry) return null;
  entry.lastActive = Date.now();
  return entry.session;
}

function deleteSession(id) {
  store.delete(id);
}

module.exports = { createSession, getSession, deleteSession };
