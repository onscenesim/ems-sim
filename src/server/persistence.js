'use strict';

const fs   = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, '../../sessions');
const MAX_AGE_MS   = 30 * 24 * 60 * 60 * 1000; // 30 days

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

function sessionPath(id) {
  const safe = id.replace(/[^a-zA-Z0-9-]/g, '');
  return path.join(SESSIONS_DIR, `${safe}.json`);
}

function save(snapshot) {
  snapshot.savedAt = Date.now();
  try {
    fs.writeFileSync(sessionPath(snapshot.id), JSON.stringify(snapshot), 'utf8');
  } catch (err) {
    console.error('[persistence] save failed:', err.message);
  }
}

function load(id) {
  try {
    const raw = fs.readFileSync(sessionPath(id), 'utf8');
    const data = JSON.parse(raw);
    if (Date.now() - data.savedAt > MAX_AGE_MS) {
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

function markDebriefed(id) {
  update(id, { debriefed: true });
}

// Prune files older than MAX_AGE_MS on startup
function pruneOld() {
  try {
    for (const f of fs.readdirSync(SESSIONS_DIR)) {
      const fp = path.join(SESSIONS_DIR, f);
      try {
        const stat = fs.statSync(fp);
        if (Date.now() - stat.mtimeMs > MAX_AGE_MS) fs.unlinkSync(fp);
      } catch {}
    }
  } catch {}
}

pruneOld();

module.exports = { save, load, update, markDebriefed };
