'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { DATA_DIR } = require('./storagePath');
const { SORT_XP, CALL_XP } = require('../engine/glovebox');

const scrypt = promisify(crypto.scrypt);
const STORE_PATH = path.join(DATA_DIR, 'players.json');
const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'ems_player';
const TRACKED_CATEGORIES = [
  'medical', 'trauma', 'cardiac', 'respiratory', 'behavioral', 'neuro',
  'toxicology', 'arrest', 'curveballs', 'pediatric', 'doa', 'ob',
];

function emptyStore() {
  return { version: 1, players: [], sessions: [] };
}

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    if (!parsed || !Array.isArray(parsed.players) || !Array.isArray(parsed.sessions)) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

let store = loadStore();

function saveStore() {
  const tmp = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store), 'utf8');
  fs.renameSync(tmp, STORE_PATH);
}

function normalizeName(value) {
  return typeof value === 'string'
    ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().replace(/\s+/g, ' ')
    : '';
}

function validateCredentials(displayName, pin) {
  const cleanName = normalizeName(displayName);
  if (cleanName.length < 2 || cleanName.length > 24) {
    const err = new Error('Player name must be 2–24 characters.');
    err.code = 'invalid_player_name';
    throw err;
  }
  if (!/^[\p{L}\p{N} ._'’-]+$/u.test(cleanName)) {
    const err = new Error('Player name contains unsupported characters.');
    err.code = 'invalid_player_name';
    throw err;
  }
  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
    const err = new Error('PIN must contain 4–8 digits.');
    err.code = 'invalid_pin';
    throw err;
  }
  return cleanName;
}

function nameKey(name) {
  return name.normalize('NFKC').toLocaleLowerCase('en-US');
}

async function pinDigest(pin, salt) {
  const value = await scrypt(pin, Buffer.from(salt, 'base64url'), 32);
  return Buffer.from(value).toString('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(a || '', 'base64url');
  const right = Buffer.from(b || '', 'base64url');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function ensureStats(player) {
  const existing = player.stats && typeof player.stats === 'object' ? player.stats : {};
  const categoryCompletions = {};
  for (const category of TRACKED_CATEGORIES) {
    const count = Number(existing.categoryCompletions?.[category]);
    categoryCompletions[category] = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  }
  player.stats = {
    xp: Math.max(0, Math.floor(Number(existing.xp) || 0)),
    itemsRecovered: Math.max(0, Math.floor(Number(existing.itemsRecovered) || 0)),
    itemsDiscarded: Math.max(0, Math.floor(Number(existing.itemsDiscarded) || 0)),
    scenariosStarted: Number(existing.scenariosStarted) || 0,
    scenariosCompleted: Number(existing.scenariosCompleted) || 0,
    debriefsGenerated: Number(existing.debriefsGenerated) || 0,
    categoryCompletions,
    recentCategories: Array.isArray(existing.recentCategories)
      ? existing.recentCategories.filter(category => TRACKED_CATEGORIES.includes(category)).slice(-5)
      : [],
    lastCompletedAt: Number(existing.lastCompletedAt) || null,
  };
  return player.stats;
}

function publicPlayer(player) {
  const stats = ensureStats(player);
  return {
    id: player.id,
    displayName: player.displayName,
    createdAt: player.createdAt,
    preferences: { showFieldBriefing: player.preferences?.showFieldBriefing !== false },
    stats: {
      xp: stats.xp,
      itemsRecovered: stats.itemsRecovered,
      itemsDiscarded: stats.itemsDiscarded,
      scenariosStarted: stats.scenariosStarted,
      scenariosCompleted: stats.scenariosCompleted,
      debriefsGenerated: stats.debriefsGenerated,
      categoryCompletions: { ...stats.categoryCompletions },
      recentCategories: [...stats.recentCategories],
      lastCompletedAt: stats.lastCompletedAt,
    },
  };
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('base64url');
}

function pruneSessions() {
  const now = Date.now();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter(session => session.expiresAt > now);
  return store.sessions.length !== before;
}

function createLoginSession(playerId) {
  pruneSessions();
  const token = crypto.randomBytes(32).toString('base64url');
  store.sessions.push({
    tokenHash: tokenHash(token),
    playerId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE_MS,
  });
  saveStore();
  return token;
}

async function signup(displayName, pin) {
  const cleanName = validateCredentials(displayName, pin);
  const key = nameKey(cleanName);
  if (store.players.some(player => player.nameKey === key)) {
    const err = new Error('That player name is already in use. Try logging in instead.');
    err.code = 'player_exists';
    throw err;
  }

  const salt = crypto.randomBytes(16).toString('base64url');
  const pinHash = await pinDigest(pin, salt);
  // Check again after the asynchronous hash in case another signup arrived.
  if (store.players.some(player => player.nameKey === key)) {
    const err = new Error('That player name is already in use. Try logging in instead.');
    err.code = 'player_exists';
    throw err;
  }

  const now = Date.now();
  const player = {
    id: crypto.randomUUID(),
    displayName: cleanName,
    nameKey: key,
    pinSalt: salt,
    pinHash,
    createdAt: now,
    lastSeenAt: now,
    stats: {
      scenariosStarted: 0,
      scenariosCompleted: 0,
      debriefsGenerated: 0,
      categoryCompletions: Object.fromEntries(TRACKED_CATEGORIES.map(category => [category, 0])),
      recentCategories: [],
      lastCompletedAt: null,
    },
  };
  store.players.push(player);
  const token = createLoginSession(player.id);
  return { player: publicPlayer(player), token };
}

async function login(displayName, pin) {
  const cleanName = validateCredentials(displayName, pin);
  const player = store.players.find(candidate => candidate.nameKey === nameKey(cleanName));
  // Run a real scrypt even for an unknown name so name probing is less useful.
  const salt = player?.pinSalt || crypto.randomBytes(16).toString('base64url');
  const digest = await pinDigest(pin, salt);
  if (!player || !safeEqual(digest, player.pinHash)) {
    const err = new Error('Player name or PIN is incorrect.');
    err.code = 'invalid_login';
    throw err;
  }
  player.lastSeenAt = Date.now();
  const token = createLoginSession(player.id);
  return { player: publicPlayer(player), token };
}

function getPlayerByToken(token) {
  if (!token || typeof token !== 'string') return null;
  const changed = pruneSessions();
  const session = store.sessions.find(candidate => safeEqual(candidate.tokenHash, tokenHash(token)));
  if (changed) {
    try { saveStore(); } catch (err) { console.error('[playerStore] session prune failed:', err.message); }
  }
  if (!session) return null;
  const player = store.players.find(candidate => candidate.id === session.playerId);
  return player || null;
}

function logout(token) {
  if (!token) return;
  const hash = tokenHash(token);
  const before = store.sessions.length;
  store.sessions = store.sessions.filter(session => !safeEqual(session.tokenHash, hash));
  if (store.sessions.length !== before) saveStore();
}

function updatePreferences(player, preferences) {
  if (typeof preferences?.showFieldBriefing !== 'boolean') {
    const err = new Error('Field briefing preference must be true or false.');
    err.code = 'invalid_preferences';
    throw err;
  }
  const previous = player.preferences;
  player.preferences = { showFieldBriefing: preferences.showFieldBriefing };
  try { saveStore(); } catch (err) {
    player.preferences = previous;
    throw err;
  }
  return publicPlayer(player);
}

function recordScenarioStarted(playerId) {
  const player = store.players.find(candidate => candidate.id === playerId);
  if (!player) return;
  const stats = ensureStats(player);
  stats.scenariosStarted += 1;
  player.lastSeenAt = Date.now();
  try { saveStore(); } catch (err) { console.error('[playerStore] start tracking failed:', err.message); }
}

function recordScenarioCompleted(playerId, seed = {}, callId = null) {
  const player = store.players.find(candidate => candidate.id === playerId);
  if (!player) return;
  const key = callId && `${callId}:complete`;
  if (key && player.xpEvents?.[key]) return;
  const previous = structuredClone(player);
  const stats = ensureStats(player);
  stats.scenariosCompleted += 1;
  stats.xp += CALL_XP[seed.difficulty] || CALL_XP.NORMAL;
  if (key) { player.xpEvents ||= {}; player.xpEvents[key] = true; }
  if (TRACKED_CATEGORIES.includes(seed.category)) {
    stats.categoryCompletions[seed.category] += 1;
    stats.recentCategories.push(seed.category);
    stats.recentCategories = stats.recentCategories.slice(-5);
  }
  stats.lastCompletedAt = Date.now();
  player.lastSeenAt = stats.lastCompletedAt;
  try { saveStore(); } catch (err) { Object.assign(player, previous); player.xpEvents = previous.xpEvents; throw err; }
}

function recordGloveboxSorted(playerId, callId, itemId, destination) {
  const player = store.players.find(candidate => candidate.id === playerId);
  if (!player) return;
  const key = `${callId}:glovebox:${itemId}`;
  if (player.xpEvents?.[key]) return;
  const previous = structuredClone(player);
  const stats = ensureStats(player);
  stats.xp += SORT_XP;
  stats[destination === 'pocket' ? 'itemsRecovered' : 'itemsDiscarded'] += 1;
  player.xpEvents ||= {};
  player.xpEvents[key] = true;
  try { saveStore(); } catch (err) {
    player.stats = previous.stats;
    player.xpEvents = previous.xpEvents;
    throw err;
  }
}

function recordDebriefGenerated(playerId) {
  const player = store.players.find(candidate => candidate.id === playerId);
  if (!player) return;
  const stats = ensureStats(player);
  stats.debriefsGenerated += 1;
  player.lastSeenAt = Date.now();
  try { saveStore(); } catch (err) { console.error('[playerStore] debrief tracking failed:', err.message); }
}

module.exports = {
  COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  signup,
  login,
  logout,
  getPlayerByToken,
  publicPlayer,
  updatePreferences,
  recordScenarioStarted,
  recordScenarioCompleted,
  recordGloveboxSorted,
  recordDebriefGenerated,
};
