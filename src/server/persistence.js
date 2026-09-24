'use strict';

const fs   = require('fs');
const path = require('path');
const { DATA_DIR: SESSIONS_DIR } = require('./storagePath');

const MAX_AGE_MS   = 30 * 24 * 60 * 60 * 1000; // 30 days

function sessionPath(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Invalid session ID');
  const safe = id;
  return path.join(SESSIONS_DIR, `${safe}.json`);
}

function save(snapshot) {
  snapshot.savedAt = Date.now();
  try {
    const target = sessionPath(snapshot.id);
    fs.writeFileSync(target + '.tmp', JSON.stringify(snapshot), 'utf8');
    fs.renameSync(target + '.tmp', target);
  } catch (err) {
    console.error('[persistence] save failed:', err.message);
  }
}

function load(id) {
  try {
    const raw = fs.readFileSync(sessionPath(id), 'utf8');
    const data = JSON.parse(raw);
    if (data.id !== id) return null;
    if (!keepInLibrary(data) && Date.now() - data.savedAt > MAX_AGE_MS) {
      fs.unlinkSync(sessionPath(id));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function update(id, patch) {
  const data = load(id);
  if (!data) return;
  Object.assign(data, patch);
  save(data);
}

function remove(id) {
  try {
    fs.unlinkSync(sessionPath(id));
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

function markDebriefed(id) {
  update(id, { debriefed: true });
}

// Completed account-owned calls form the durable library. Guests and unfinished
// calls retain the existing 30-day expiry. Only authenticated route handlers
// expose these records; never expose this scanner directly to a client.
function keepInLibrary(data) {
  return !!(data.playerId && data.closed && data.seed);
}
function listPlayerRuns(playerId) {
  if (!playerId) return [];
  return fs.readdirSync(SESSIONS_DIR).filter(f => /^[a-zA-Z0-9-]+\.json$/.test(f))
    .map(f => load(f.slice(0, -5))).filter(run => run?.playerId === playerId && run.seed)
    .sort((a, b) => String(b.seed.timestamp_start || '').localeCompare(String(a.seed.timestamp_start || '')) || b.id.localeCompare(a.id));
}

// Prune files older than MAX_AGE_MS on startup
// Excludes durable aggregate files — they are not individual session snapshots.
function pruneOld() {
  try {
    for (const f of fs.readdirSync(SESSIONS_DIR)) {
      if (['user_history.json', 'user_history.json.tmp',
           'completed_runs.json', 'completed_runs.json.tmp',
           'players.json', 'players.json.tmp'].includes(f)) continue;
      const fp = path.join(SESSIONS_DIR, f);
      try {
        const stat = fs.statSync(fp);
        if (Date.now() - stat.mtimeMs > MAX_AGE_MS) {
          let data;
          try { data = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch {}
          if (!data || !keepInLibrary(data)) fs.unlinkSync(fp);
        }
      } catch {}
    }
  } catch {}
}

pruneOld();

module.exports = { save, load, update, remove, markDebriefed, listPlayerRuns };
