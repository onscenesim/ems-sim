'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { DATA_DIR } = require('./storagePath');

const scrypt = promisify(crypto.scrypt);
const STORE_PATH = path.join(DATA_DIR, 'players.json');
const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'ems_player';

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

function publicPlayer(player) {
  return {
    id: player.id,
    displayName: player.displayName,
    createdAt: player.createdAt,
    stats: {
      scenariosStarted: player.stats?.scenariosStarted || 0,
      scenariosCompleted: player.stats?.scenariosCompleted || 0,
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
    stats: { scenariosStarted: 0, scenariosCompleted: 0 },
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

function recordScenarioStarted(playerId) {
  const player = store.players.find(candidate => candidate.id === playerId);
  if (!player) return;
  player.stats ||= { scenariosStarted: 0, scenariosCompleted: 0 };
  player.stats.scenariosStarted += 1;
  player.lastSeenAt = Date.now();
  try { saveStore(); } catch (err) { console.error('[playerStore] start tracking failed:', err.message); }
}

function recordScenarioCompleted(playerId) {
  const player = store.players.find(candidate => candidate.id === playerId);
  if (!player) return;
  player.stats ||= { scenariosStarted: 0, scenariosCompleted: 0 };
  player.stats.scenariosCompleted += 1;
  player.lastSeenAt = Date.now();
  try { saveStore(); } catch (err) { console.error('[playerStore] completion tracking failed:', err.message); }
}

module.exports = {
  COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  signup,
  login,
  logout,
  getPlayerByToken,
  publicPlayer,
  recordScenarioStarted,
  recordScenarioCompleted,
};
