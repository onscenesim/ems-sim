'use strict';

const { v4: uuidv4 } = require('uuid');
const { Session }     = require('../engine/session');
const { rollScenario } = require('../engine/roller');

const TTL_MS = 4 * 60 * 60 * 1000; // 4 hours of inactivity (free tier); paid/beta sessions never expire

// id → { session: Session, lastActive: number, userId: string, tier: string }
const store = new Map();

// Prune expired free-tier sessions every 5 minutes; paid sessions never expire.
setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, entry] of store) {
    if (entry.tier !== 'paid' && entry.lastActive < cutoff) store.delete(id);
  }
}, 5 * 60 * 1000);

/**
 * Roll a new scenario, wrap it in a Session, and persist it.
 * Returns { id, seed }.
 */
function createSession({ difficulty = 'NORMAL', provider_level = 'ALS', region_id = 'SUBURBAN' } = {}, userId = 'anon', tier = 'free') {
  const history = {
    categories: [], presentations: [], crew: [],
    doa_positions: [], arrest_positions: [], total_count: 0,
  };

  const seed = rollScenario({
    difficulty,
    provider_level,
    region_id,
    user_id: userId,
    history,
  });

  const session = new Session(seed);
  const id = uuidv4();
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
