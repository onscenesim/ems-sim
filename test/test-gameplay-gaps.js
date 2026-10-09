'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-gap-tests-'));
process.env.EMS_DATA_DIR = dataDir;
let response = '', request;
require.cache[require.resolve('../src/engine/api')] = { exports: {
  sendTurn: async (_system, messages) => { request = messages.at(-1).content; return response; },
  sendDebrief: async () => '',
} };
require.cache[require.resolve('../src/engine/logger')] = { exports: { logEvent() {}, closeScenario() {} } };
require.cache[require.resolve('../src/server/adminLogger')] = { exports: { logRun() {}, updateRunDebrief() {} } };
const { Session } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');
const { restoreSession, deleteSession } = require('../src/server/sessionStore');
const { detectWithConfirmation } = require('../src/engine/dice');
const { acquireTwelveLeads } = require('../src/engine/twelve-lead');
const { hasCardiacMonitor } = require('../src/engine/equipment');
const router = require('../src/server/routes/scenario');
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
function session(level = 'ALS') {
  return new Session(rollScenario({ random_seed: 'gameplay-gaps', provider_level: level, region: 'SUBURBAN', category: 'medical' }));
}
function reply(text, time, tags = '') {
  response = `${text}\n${tags}\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[TIME: ${time}]`;
}

test('every ECG view is blocked before rolling and filing on an unequipped BLS unit', async () => {
  const s = session('BLS');
  for (const order of ['Acquire a 12-lead ECG.', 'Acquire posterior leads.', 'Acquire right-sided leads.', 'Acquire V4R leads.']) {
    // Even a model ignoring the restriction cannot create a roll or printout.
    reply('The ECG paper is filed.', '2:00');
    const result = await s.send(order);
    assert.equal(result.rolls.length, 0, order);
    assert.ok(result.suppressed.some(item => item.unavailable), order);
    assert.equal(s.turns.at(-1).twelveLeads.length, 0, order);
    assert.match(request, /CANNOT be performed.*No cardiac monitor/);
    assert.doesNotMatch(result.reply, /paper is filed/);
    assert.match(result.reply, /ECG acquisition was not performed/);
  }
  assert.deepEqual(acquireTwelveLeads({ seed: s.seed, rolls: [{ procedure_id: 'twelve_lead', outcome: 'SUCCESS' }] }), []);
});

test('only arrived ALS backup with an explicitly available monitor enables BLS ECGs', async () => {
  const s = session('BLS');
  for (const backup of [null, { status: 'en_route', level: 'ALS', monitor: true },
    { status: 'on_scene' }, { status: 'on_scene', level: 'BLS', monitor: true },
    { status: 'on_scene', level: 'ALS', monitor: false }, { status: 'cancelled', level: 'ALS', monitor: true }]) {
    assert.equal(hasCardiacMonitor(s.seed, backup), false);
  }
  reply('Named ALS backup arrives with its monitor.', '1:00', '[BACKUP: on_scene ETA=0 LEVEL=ALS MONITOR=available]');
  await s.send('Wait for the requested crew.');
  assert.equal(hasCardiacMonitor(s.seed, s.backupStatus), true);
  const restored = restoreSession({ id: randomUUID(), seed: s.seed, messages: s.messages, turns: s.turns,
    backupStatus: s.backupStatus, sceneMinute: s.sceneMinute });
  reply('The ECG paper is filed.', '2:00');
  const result = await restored.send('Acquire a 12-lead ECG.');
  assert.equal(result.rolls[0].procedure_id, 'twelve_lead');
  assert.equal(restored.turns.at(-1).twelveLeads.length, 1);
  reply('The monitor is no longer available.', '3:00', '[BACKUP: on_scene ETA=0 MONITOR=unavailable]');
  await restored.send('Reassess the available equipment.');
  assert.equal(restored.backupStatus.level, 'ALS');
  assert.equal(hasCardiacMonitor(restored.seed, restored.backupStatus), false);
  deleteSession(restored.sessionId);
});

test('backup arrival in the same response cannot retroactively acquire an unrolled ECG', async () => {
  const s = session('BLS');
  reply('ALS crew arrives with a monitor.', '1:00', '[BACKUP: on_scene ETA=0 LEVEL=ALS MONITOR=available]');
  const result = await s.send('Acquire a 12-lead ECG.');
  assert.equal(result.rolls.length, 0);
  assert.equal(s.turns.at(-1).twelveLeads.length, 0);
  reply('The ALS crew files the ECG paper.', '2:00');
  await s.send('Acquire a 12-lead ECG.');
  assert.equal(s.turns.at(-1).twelveLeads.length, 1);
});

test('arrival skips preserve a committed major destination and ETA with absent or conflicting tags', async () => {
  for (const level of ['ALS', 'BLS']) for (const tag of ['', '[EN_ROUTE:nearest]']) {
    const s = session(level);
    reply('The ambulance departs.', '4:00', '[EN_ROUTE:major]');
    await s.send('Depart for the major hospital.');
    const eta = s.transportEtaMin;
    assert.equal(s.transportDest, 'major');
    reply('The ambulance reaches the ED bay doors.', '34:00', tag);
    const result = await s.send('Skip ahead to arrival.', false, 'to_arrival');
    assert.equal(result.transportDest, 'major');
    assert.equal(result.transportEtaMin, eta);
    assert.equal(result.arrived, true);
    assert.equal(result.closed, false);
  }
});

test('new transport defaults coherently and explicit redirection still changes destination and ETA', async () => {
  const s = session();
  reply('The ambulance pulls away from the scene, heading to the hospital.', '4:00');
  await s.send('Depart for the hospital.');
  assert.equal(s.transportDest, 'nearest');
  const nearestEta = s.transportEtaMin;
  reply('The ambulance redirects toward the major hospital.', '5:00', '[EN_ROUTE:major]');
  await s.send('Redirect to the major hospital.');
  assert.equal(s.transportDest, 'major');
  assert.notEqual(s.transportEtaMin, nearestEta);
});

test('radio reports and handoffs advance from the TIME footer without inventing procedure rolls', async () => {
  const s = session();
  s.sceneMinute = 7;
  reply('The receiving nurse acknowledges the radio report.', '7:30');
  let result = await s.send('We started an IV and acquired a 12-lead.', true);
  assert.equal(s.sceneMinute, 7.5);
  assert.equal(s.turns.at(-1).sceneMinute, 7.5);
  assert.deepEqual(result.rolls, []);
  assert.match(request, /Reports consume scene time too/);
  reply('The receiving team accepts transfer.', '8:15');
  result = await s.send('Transfer care with the assessment and vital trends.', true);
  assert.equal(s.sceneMinute, 8.25);
  assert.equal(s.turns.at(-1).sceneMinute, 8.25);
  assert.equal(result.closed, true);
});

test('missing or regressing report time does not rewind the scene or invent a fixed time increment', async () => {
  const s = session();
  s.sceneMinute = 7;
  for (const text of ['Report acknowledged.', 'Report acknowledged. [TIME: 6:00]']) {
    response = `${text} [CREW_STATUS: partner=on_scene captain=not_on_scene]`;
    await s.send('Radio report: patient is stable.', true);
    assert.equal(s.sceneMinute, 7);
  }
});

test('IV retry wording gets one attempt while conditional, negated and historical references stay quiet', () => {
  for (const order of ['Okafor, try one IV in the left arm.', 'Try an IV.', 'Attempt one IV.', 'Retry the IV.', 'Reattempt an IV.']) {
    const result = detectWithConfirmation(order);
    assert.equal(result.rolls.length, 1, order);
    assert.equal(result.rolls[0].procedure_id, 'peripheral_iv', order);
  }
  for (const order of ['If needed, try one IV.', 'Do not try one IV.', 'We tried one IV earlier.']) {
    assert.equal(detectWithConfirmation(order).rolls.length, 0, order);
  }
});

test('the real turn route returns unavailable equipment during confirmation without running a turn', async () => {
  const s = session('BLS');
  const id = randomUUID(), ownerId = 'gap-test-browser-owner';
  restoreSession({ id, seed: s.seed, ownerId, messages: [], turns: [], meta: {}, crew: {} });
  const layer = router.stack.find(entry => entry.route?.path === '/:id/turn');
  let payload;
  const res = { json(value) { payload = value; return this; }, status() { return this; } };
  await layer.route.stack[0].handle({ params: { id }, headers: { cookie: `ems_owner=${ownerId}` },
    body: { message: 'Acquire a 12-lead ECG.', operation_id: randomUUID() } }, res);
  assert.equal(payload.needs_confirmation.length, 1);
  assert.match(payload.needs_confirmation[0].unavailable, /No cardiac monitor/);
  deleteSession(id);
});
