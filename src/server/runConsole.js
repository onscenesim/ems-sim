'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const LIMIT = 250;
const active = new AsyncLocalStorage();
// Keep diagnostics on the live session, outside the engine's transactional
// draft. A failed turn still needs a record even though its state rolls back.
const logs = new WeakMap();
const ERROR_CODES = new Set([
  'model_timeout', 'model_content_filtered', 'model_empty_response',
  'invalid_scene_reply', 'invalid_debrief_evidence', 'operation_cancelled',
  'shock_not_prepared',
]);

function getRunConsole(session) {
  return logs.get(session) || null;
}

function restoreRunConsole(session, saved) {
  if (!Array.isArray(saved?.entries)) return;
  logs.set(session, {
    entries: saved.entries.slice(-LIMIT),
    dropped: (saved.dropped || 0) + Math.max(0, saved.entries.length - LIMIT),
  });
}

// Mirror only explicitly chosen, structured diagnostic fields. Raw errors,
// request bodies, credentials and other processes' output never enter this log.
function writeRunConsole(event, details = {}, level = 'log') {
  const scope = active.getStore();
  if (!scope) return false;
  const { session, phase, turn_index, log } = scope;
  const entry = {
    ...details, timestamp: new Date().toISOString(), level, event,
    session_id: session.sessionId, phase, turn_index, scene_minute: session.sceneMinute,
  };
  if (log.entries.length >= LIMIT) {
    log.entries.shift();
    log.dropped++;
  }
  log.entries.push(entry);
  console[level](JSON.stringify(entry));
  return true;
}

function withRunConsole(session, phase, work) {
  let log = getRunConsole(session);
  if (!log) logs.set(session, log = { entries: [], dropped: 0 });
  return active.run({ session, phase, turn_index: session.turns.length, log }, async () => {
    const start = performance.now();
    const elapsed = () => Math.round(performance.now() - start);
    writeRunConsole('RUN_OPERATION_STARTED');
    try {
      const result = await work();
      writeRunConsole('RUN_OPERATION_FINISHED', { duration_ms: elapsed() });
      return result;
    } catch (error) {
      const code = ERROR_CODES.has(error?.code) ? error.code : 'api_error';
      writeRunConsole('RUN_OPERATION_FAILED', { code, duration_ms: elapsed() },
        code === 'operation_cancelled' ? 'log' : 'warn');
      throw error;
    }
  });
}

module.exports = { getRunConsole, restoreRunConsole, withRunConsole, writeRunConsole };
