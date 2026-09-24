'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-library-tests-'));
process.env.EMS_DATA_DIR = dataDir;
const apiPath = require.resolve('../src/engine/api');
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: {
  sendTurn: async () => 'Test dispatch. [TIME: 1:00]',
  sendDebrief: async () => 'Test debrief.\n[PATIENT_OUTCOME: Discharged home on September 26, 2026]',
} };
const { buildDebriefPrompt, parseDebriefResponse } = require('../src/engine/prompts/debrief');
const { buildDebriefContext } = require('../src/engine/assembler');
const router = require('../src/server/routes/scenario');
const persistence = require('../src/server/persistence');
const playerStore = require('../src/server/playerStore');
const { rollScenario } = require('../src/engine/roller');
const { deleteSession, restoreSession } = require('../src/server/sessionStore');
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
async function route(routePath, { method = 'get', body = {}, params = {}, query = {}, cookie = '' } = {}) {
  const layer = router.stack.find(entry => entry.route?.path === routePath && entry.route.methods[method]);
  let status = 200, payload;
  const headers = {};
  const res = { status(value) { status = value; return this; }, json(value) { payload = value; return this; }, setHeader(key, value) { headers[key] = value; } };
  await layer.route.stack[0].handle({ body, params, query, headers: { cookie }, ip: 'test' }, res);
  return { status, body: payload, headers };
}
function snapshot(playerId, ownerId = 'browser-owner-1234567890') {
  const seed = rollScenario({ random_seed: randomUUID(), category: 'trauma' });
  return { id: randomUUID(), seed: { ...structuredClone(seed), timestamp_start: '2026-09-24T12:00:00.000Z', events: [{ event_type: 'old_action' }], timestamp_end: '2026-09-23' }, initialSeed: seed, ownerId, playerId, closed: true, debriefText: 'Saved debrief.', patientOutcome: 'Discharged to skilled nursing after 4 days', turns: [{ user: 'Check vitals', assistant: 'Visible assessment.', sceneMinute: 2, vitals: { HR: 100 } }], messages: [], meta: {}, crew: {} };
}
test('the debrief response carries one compact hidden patient outcome', () => {
  const prompt = buildDebriefPrompt('ALS');
  assert.match(prompt, /\[PATIENT_OUTCOME: concise likely disposition\]/);
  assert.match(prompt, /calendar date/);
  assert.doesNotMatch(prompt, /Include a time interval/);
  assert.deepEqual(parseDebriefResponse('Visible review.\n[PATIENT_OUTCOME: Expired after 2 days]', '2026-09-24T12:00:00.000Z'), {
    debrief: 'Visible review.', patientOutcome: 'Expired on September 26, 2026',
  });
  assert.deepEqual(parseDebriefResponse('Visible review only.'), {
    debrief: 'Visible review only.', patientOutcome: null,
  });
  const datedSeed = rollScenario({ random_seed: 'outcome-date', category: 'medical' });
  datedSeed.timestamp_start = '2026-09-24T12:00:00.000Z';
  assert.match(buildDebriefContext(datedSeed, []), /Call date \(day 0 for the patient outcome\): 2026-09-24/);
});
test('library, details, transcripts, session export and replay enforce account ownership on every request', async () => {
  const a = await playerStore.signup('Library Player A', '1234');
  const b = await playerStore.signup('Library Player B', '4321');
  const runA = snapshot(a.player.id), runB = snapshot(b.player.id);
  persistence.save(runA); persistence.save(runB);
  const cookieA = `ems_player=${a.token}`;
  const cookieB = `ems_player=${b.token}; ems_owner=${runA.ownerId}`;
  assert.equal((await route('/runs')).status, 401);
  const list = await route('/runs', { cookie: cookieA });
  assert.deepEqual(list.body.runs.map(r => r.id), [runA.id]);
  assert.equal(list.body.runs[0].patientOutcome, 'Discharged to skilled nursing on September 28, 2026');
  for (const routePath of ['/runs/:runId', '/runs/:runId/transcript']) {
    assert.equal((await route(routePath, { params: { runId: runA.id }, cookie: cookieB })).status, 404);
    assert.equal((await route(routePath, { params: { runId: runA.id }, cookie: cookieA })).status, 200);
    assert.equal((await route(routePath, { params: { runId: '../' + runA.id }, cookie: cookieA })).status, 404);
  }
  assert.equal((await route('/:id/transcript', { params: { id: runA.id }, cookie: cookieB })).status, 403);
  assert.equal((await route('/new', { method: 'post', body: { replay_of: runA.id }, cookie: cookieB })).status, 404);
  const replay = await route('/new', { method: 'post', body: { replay_of: runA.id }, cookie: cookieA });
  assert.equal(replay.status, 200);
  const saved = persistence.load(replay.body.session_id);
  assert.equal(saved.replayOf, runA.id);
  assert.equal(saved.seed.case_id, runA.seed.case_id);
  assert.equal(saved.seed.random_seed, runA.seed.random_seed);
  assert.notEqual(saved.seed.scenario_id, runA.seed.scenario_id);
  assert.equal(saved.closed, false);
  assert.equal(saved.debriefText, null);
  assert.equal(saved.seed.timestamp_end, undefined);
  assert.equal(saved.initialSeed.events.length, 0);
  assert.equal(saved.completionCredited, false);
  assert.equal(saved.seed.presentation, runA.seed.presentation);
  deleteSession(saved.id);
  const restored = restoreSession(saved);
  assert.deepEqual(restored.initialSeed, saved.initialSeed);
  assert.equal(restored.replayOf, runA.id);
  restored.closed = true;
  const debrief = await route('/:id/debrief', { method: 'post', params: { id: saved.id }, cookie: cookieA, body: { operation_id: randomUUID() } });
  assert.equal(debrief.body.debrief, 'Test debrief.');
  assert.equal(debrief.body.patientOutcome, 'Discharged home on September 26, 2026');
  assert.equal(debrief.body.comparison.previous[0].action, 'Check vitals');
  assert.equal(debrief.body.learning.scored, false);
  assert.equal(persistence.load(saved.id).patientOutcome, 'Discharged home on September 26, 2026');
  assert.equal((await route('/:id/transcript', { params: { id: saved.id }, cookie: cookieA })).body.patientOutcome, 'Discharged home on September 26, 2026');
  assert.equal(persistence.load(runA.id).debriefText, 'Saved debrief.');
  const detail = await route('/runs/:runId', { params: { runId: runA.id }, cookie: cookieA });
  assert.equal(detail.body.transcript[0].response, 'Visible assessment.');
  assert.equal(detail.body.seed, undefined);
  assert.equal((await route('/runs', { cookie: cookieA, query: { page: '-1' } })).status, 400);
  assert.equal((await route('/runs', { cookie: cookieA, query: { category: 'unknown' } })).status, 400);
  assert.equal((await route('/runs', { cookie: cookieA, query: { category: 'ob' } })).body.total, 0);
  const deletable = snapshot(a.player.id);
  persistence.save(deletable);
  assert.equal((await route('/runs', { method: 'delete', body: { ids: [deletable.id] } })).status, 401);
  assert.equal((await route('/runs', { method: 'delete', body: { ids: [deletable.id, deletable.id] }, cookie: cookieA })).status, 400);
  assert.equal((await route('/runs', { method: 'delete', body: { ids: [deletable.id, runB.id] }, cookie: cookieA })).status, 404);
  assert.ok(persistence.load(deletable.id));
  const deleted = await route('/runs', { method: 'delete', body: { ids: [deletable.id] }, cookie: cookieA });
  assert.deepEqual(deleted.body, { deleted: 1 });
  assert.equal(persistence.load(deletable.id), null);
  // Logout invalidates access even in the original browser.
  playerStore.logout(a.token);
  assert.equal((await route('/runs/:runId', { params: { runId: runA.id }, cookie: cookieA })).status, 401);
});
test('guest replay requires the browser owner and legacy/incomplete calls cannot replay', async () => {
  const run = snapshot(null);
  persistence.save(run);
  assert.equal((await route('/new', { method: 'post', body: { replay_of: run.id } })).status, 404);
  const cookie = `ems_owner=${run.ownerId}`;
  assert.equal((await route('/new', { method: 'post', body: { replay_of: run.id }, cookie })).status, 200);
  persistence.update(run.id, { initialSeed: null });
  assert.equal((await route('/new', { method: 'post', body: { replay_of: run.id }, cookie })).status, 409);
});
test('completed player calls survive expiry and restart; old guest calls expire', () => {
  const retained = snapshot('durable-player');
  const guest = snapshot(null);
  for (const run of [retained, guest]) fs.writeFileSync(path.join(dataDir, `${run.id}.json`), JSON.stringify({ ...run, savedAt: Date.now() - 31 * 86400000 }));
  delete require.cache[require.resolve('../src/server/persistence')];
  const restarted = require('../src/server/persistence');
  assert.equal(restarted.load(retained.id).id, retained.id);
  assert.equal(restarted.load(guest.id), null);
});
