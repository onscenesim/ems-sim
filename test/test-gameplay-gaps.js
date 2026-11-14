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
const { detectWithConfirmation, rollProcedure } = require('../src/engine/dice');
const { careSeconds } = require('../src/engine/care-timing');
const { acquireTwelveLeads } = require('../src/engine/twelve-lead');
const { hasCardiacMonitor } = require('../src/engine/equipment');
const router = require('../src/server/routes/scenario');
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
function session(level = 'ALS', legacy = false) {
  const seed = rollScenario({ random_seed: 'gameplay-gaps', provider_level: level, region_id: 'SUBURBAN', category: 'medical' });
  // Saved pre-checklist runs retain their original equipment behavior.
  if (legacy) delete seed.protocols;
  return new Session(seed);
}
function reply(text, time, tags = '') {
  response = `${text}\n${tags}\n[CREW_STATUS: partner=on_scene captain=not_on_scene]\n[TIME: ${time}]`;
}

test('an assessment returns its findings before an outcome-dependent order can execute', async () => {
  for (const order of [
    'Check blood pressure. If the systolic is under 90, start an IV.',
    'Check blood pressure and start an IV if the systolic is under 90.',
  ]) {
    const s = session();
    reply('The manual blood pressure is 78/46.', '0:05', '[VITALS: BP=78/46]');
    const result = await s.send(order);
    assert.deepEqual(result.rolls.map(r => r.procedure_id), ['vitals_manual']);
    assert.doesNotMatch(request, /start an IV|SYSTEM ROLL:/i);
    assert.match(result.reply, /Paused for reassessment/);
    assert.equal(s.turns.at(-1).user, order);
    assert.equal(s.sceneMinute, 0.75);
  }
});

test('sequential care costs the same scene time in one message or separate messages', async () => {
  const bundled = session();
  const split = session();
  reply('The crew follows the order.', '0:00');
  await bundled.send('Suction the airway, then start an IV.');
  await split.send('Suction the airway.');
  await split.send('Start an IV.');
  assert.equal(bundled.sceneMinute, 2);
  assert.equal(split.sceneMinute, bundled.sceneMinute);
  assert.match(bundled.messages.at(-1).content, /\[TIME: 2:00\]$/);
});

test('assigned care can overlap with an available partner and serializes when the partner is driving', async () => {
  for (const [partner, expected] of [['on_scene', 1.5], ['driving', 2]]) {
    const s = session();
    s.crewStatus = { partner, captain: 'not_on_scene' };
    s.moving = partner === 'driving';
    response = 'The available crew completes the work. [CREW_STATUS: partner=' + partner + ' captain=not_on_scene]';
    await s.send('My partner suctions the airway while I start an IV.');
    assert.equal(s.sceneMinute, expected);
  }
});

test('the bundled airway technique retains its bonus and scheduled time', async () => {
  const s = session();
  s.contextFlags.difficult_airway = false;
  const random = Math.random;
  Math.random = () => 0.95;
  try {
    reply('Suction clears secretions during intubation.', '0:05');
    const { rolls } = await s.send('Suction and intubate.');
    assert.deepEqual(rolls.map(r => [r.procedure_id, r.dc]), [['suction', 5], ['intubation', 8]]);
    assert.equal(s.sceneMinute, 1.5);
  } finally {
    Math.random = random;
  }
});

test('bundled suction adds no scene time when the suction attempt complicates', async () => {
  const s = session();
  const random = Math.random;
  Math.random = () => 0;
  try {
    reply('The suction jams while the airway attempt is in progress.', '0:05');
    const { rolls } = await s.send('Intubate while using suction.');
    assert.deepEqual(rolls.map(r => [r.procedure_id, r.outcome]), [
      ['intubation', 'COMPLICATION'], ['suction', 'COMPLICATION'],
    ]);
    assert.equal(s.sceneMinute, 1.5);
  } finally {
    Math.random = random;
  }
});

test('every suction dice combination retains the SALAD time and matching-patient bonus', () => {
  const s = session();
  const order = 'Suction and intubate patient 2.';
  const ongoingCare = s.ongoingCareFor(order);
  const random = Math.random;
  try {
    for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
      for (let first = 1; first <= 20; first++) {
        for (let second = 1; second <= (difficulty === 'BLACK_CLOUD' ? 20 : 1); second++) {
          const faces = difficulty === 'BLACK_CLOUD' ? [first, second] : [first];
          Math.random = () => ((faces.shift() ?? 20) - 0.5) / 20;
          const { rolls } = detectWithConfirmation(order, {}, difficulty, {}, { ongoingCare });
          assert.deepEqual(rolls.map(r => r.patient), ['patient_2', 'patient_2']);
          assert.equal(rolls[1].base_dc, 8);
          assert.equal(careSeconds(order, rolls), 90);
        }
      }
    }
  } finally {
    Math.random = random;
  }
});

test('suction on a different patient contributes neither a bonus nor shared procedure time', async () => {
  const s = session();
  s.contextFlags.difficult_airway = false;
  reply('The crew performs the separate airway procedures.', '0:05');
  const { rolls } = await s.send('Suction the airway of patient 1. Intubate patient 2.');
  assert.deepEqual(rolls.map(r => [r.procedure_id, r.patient, r.dc]), [
    ['suction', 'patient_1', 5], ['intubation', 'patient_2', 10],
  ]);
  assert.equal(s.sceneMinute, 2);
  assert.doesNotMatch(request, /Bundled suction takes place/);
});

test('successful ongoing care repeats without dice or a second placement', async () => {
  const orders = [
    ['Start CPR.', 'Continue CPR.', 'cpr'],
    ['Ventilate with a BVM.', 'Continue bagging.', 'bvm'],
    ['Place an i-gel.', 'Keep the i-gel in place.', 'supraglottic_airway'],
    ['Intubate.', 'Intubate.', 'intubation'],
    ['Suction the airway.', 'Continue suctioning.', 'suction'],
    ['Place an OPA.', 'Keep the OPA in place.', 'oropharyngeal_airway'],
    ['Maintain C-spine.', 'Maintain C-spine.', 'spinal_motion_restriction'],
    ['Apply the LUCAS.', 'Continue with LUCAS.', 'lucas'],
    ['Place an NPA.', 'Keep the NPA in place.', 'nasopharyngeal_airway'],
    ['Apply CPAP.', 'Continue CPAP.', 'cpap'],
    ['Apply oxygen.', 'Continue oxygen.', 'oxygen'],
  ];
  const random = Math.random;
  try {
    for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
      for (const [initial, continued, id] of orders) {
        const s = session();
        s.seed.difficulty = difficulty;
        Math.random = () => 0.99;
        reply('The crew performs the ordered procedure.', '0:05');
        assert.ok((await s.send(initial)).rolls.some(r => r.procedure_id === id && r.roll === 20), initial);
        Math.random = () => { throw new Error('Continuation consumed a die'); };
        reply('The crew continues the existing care.', '2:15');
        const { rolls } = await s.send(continued);
        assert.deepEqual(rolls.map(r => [r.procedure_id, r.outcome, r.continued, r.roll]), [[id, 'SUCCESS', true, null]], continued);
        assert.match(request, /ESTABLISHED CARE/);
        assert.doesNotMatch(request, /\[SYSTEM ROLL:/);
      }
    }
  } finally {
    Math.random = random;
  }
});

test('a restored call confirms only the new action in a mixed care order and commits the turn once', async () => {
  const id = randomUUID(), ownerId = 'ongoing-care-browser-owner';
  const patientFocus = { id: 'patient_2', label: 'Second patient' };
  const s = restoreSession({
    id, ownerId, seed: session().seed, patientFocus, sceneMinute: 2,
    turns: [{ patientFocus, rolls: [{ procedure_id: 'bvm', patient: 'primary', outcome: 'SUCCESS', roll: 20 }] }],
  });
  const route = router.stack.find(entry => entry.route?.path === '/:id/turn').route.stack[0].handle;
  async function turn(body) {
    let payload;
    const res = { status() { return this; }, json(value) { payload = value; return this; } };
    await route({ params: { id }, headers: { cookie: `ems_owner=${ownerId}` }, body }, res);
    return payload;
  }
  const random = Math.random;
  try {
    const body = { message: 'Continue bagging and start an IV.', operation_id: randomUUID() };
    const { needs_confirmation } = await turn(body);
    assert.deepEqual(needs_confirmation.map(row => row.procedure_id), ['peripheral_iv']);
    assert.equal(s.turns.length, 1);
    let dice = 0;
    Math.random = () => { dice++; return 0.99; };
    reply('Ventilations continue and the IV flushes.', '2:05', '[PATIENT_FOCUS: patient_2 | Second patient]');
    const confirmed = { ...body, procs_resolved: true, proc_allow: [needs_confirmation[0].key] };
    const result = await turn(confirmed);
    assert.deepEqual(result.rolls.map(r => [r.procedure_id, r.continued || false]), [['bvm', true], ['peripheral_iv', false]]);
    assert.equal(result.rolls[0].patient, 'patient_2');
    assert.equal(result.scene_minute, 4);
    assert.deepEqual(await turn(confirmed), result);
    assert.equal(s.turns.length, 2);
    assert.equal(dice, 1);
  } finally {
    Math.random = random;
    deleteSession(id);
  }
});

test('a marginal result and care for another patient still require fresh dice', async () => {
  const s = session();
  const random = Math.random;
  try {
    reply('The crew bags the patient.', '0:30');
    Math.random = () => 0.25;
    assert.equal((await s.send('BVM patient 1.')).rolls[0].outcome, 'MARGINAL');
    Math.random = () => 0.95;
    assert.equal((await s.send('Continue BVM for patient 1.')).rolls[0].roll, 20);
    Math.random = () => 0;
    const other = (await s.send('BVM patient 2.')).rolls[0];
    assert.equal(other.patient, 'patient_2');
    assert.equal(other.outcome, 'COMPLICATION');
    assert.equal((await s.send('Continue BVM for patient 1.')).rolls[0].continued, true);
  } finally {
    Math.random = random;
  }
});

test('a same-turn medication waits for usable access and a failed attempt leaves the medication unrolled', async () => {
  const random = Math.random;
  try {
    for (const [face, expected] of [[0.05, ['peripheral_iv']], [0.95, ['peripheral_iv', 'medication_push']]]) {
      Math.random = () => face;
      const s = session();
      reply('The crew acts on the order.', '0:05');
      const { rolls, suppressed } = await s.send('Try an IV in the left arm, then give epinephrine IV.');
      assert.deepEqual(rolls.map(r => r.procedure_id), expected);
      assert.equal(suppressed.some(item => item.held), expected.length === 1);
      assert.equal(s.sceneMinute, expected.length === 1 ? 1.5 : 2);
    }
  } finally {
    Math.random = random;
  }
});

test('a narrated refusal of placement keeps the dependent medication out of the committed turn', async () => {
  const s = session();
  const random = Math.random;
  Math.random = () => 0.95;
  try {
    reply('The IV is not indicated. The patient withdraws their arm.', '0:15');
    const { rolls, suppressed } = await s.send('Start an IV, then give epinephrine IV.');
    assert.deepEqual(rolls, []);
    assert.deepEqual(s.access, []);
    assert.ok(suppressed.some(item => item.held));
  } finally {
    Math.random = random;
  }
});

test('hypotension alone adds two to the IV DC, with movement and difficult access still represented', () => {
  assert.equal(rollProcedure('peripheral_iv').dc, 8);
  assert.equal(rollProcedure('peripheral_iv', { hypotensive: true }).dc, 10);
  assert.equal(rollProcedure('peripheral_iv', { hypotensive: true, moving: true }).dc, 12);
  assert.equal(rollProcedure('peripheral_iv', { hypotensive: true, pediatric: true }).dc, 14);
});

test('legacy runs: every ECG view is blocked before rolling and filing on an unequipped BLS unit', async () => {
  const s = session('BLS', true);
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

test('legacy runs: only arrived ALS backup with an explicitly available monitor enables BLS ECGs', async () => {
  const s = session('BLS', true);
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

test('legacy runs: backup arrival in the same response cannot retroactively acquire an unrolled ECG', async () => {
  const s = session('BLS', true);
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

test('hospital distance advances with simulated driving time and snow reduces speed without changing the route', async () => {
  for (const [weather, startEta, afterFive] of [['clear', 750, 4.5], ['snow', 1154, 5.55]]) {
    const s = session();
    Object.assign(s.seed, { weather_id: weather, complication_type: 'none', routine_er_divert: false });
    assert.equal(s.transportStatus(), null);
    response = 'The ambulance departs.\n[EN_ROUTE:nearest]\n[CREW_STATUS: partner=driving captain=not_on_scene]\n[TIME: 4:00]';
    await s.send('Transport to Lakeview Community Hospital.');
    const departure = s.transportStatus();
    assert.equal(departure.distance_mi, 7.5);
    assert.equal(departure.eta_seconds, startEta);

    response = 'Monitoring continues.\n[TIME: 9:00]';
    await s.send('Continue monitoring.');
    assert.ok(Math.abs(s.transportStatus().distance_mi - afterFive) < 1e-8);
    assert.equal(s.transportStatus().eta_seconds, startEta - 300);

    // Even an incorrect driving tag cannot tick the ETA down during a stop.
    response = 'The rig pulls over.\n[CREW_STATUS: partner=driving captain=not_on_scene]\n[TIME: 12:00]';
    await s.send('Pull over.');
    assert.equal(s.transportStatus().phase, 'paused');
    assert.equal(s.transportStatus().eta_seconds, startEta - 300);
    response = 'The rig starts moving.\n[EN_ROUTE]\n[CREW_STATUS: partner=driving captain=not_on_scene]\n[TIME: 13:00]';
    await s.send('Resume driving.');
    assert.equal(s.transportStatus().eta_seconds, startEta - 300);

    response = 'The rig reaches the ED bay.\n[TIME: 14:00]';
    const result = await s.send('Continue current care and monitoring until arrival.', false, 'to_arrival');
    assert.equal(s.sceneMinute, 13 + (startEta - 300) / 60);
    assert.equal(s.departSceneMinute, 4);
    assert.equal(s.transportStatus().phase, 'arrived');
    assert.equal(result.closed, false);
  }
});

test('diversion at the hospital preserves the location and the saved reroute includes backtracking', async () => {
  const s = session();
  Object.assign(s.seed, { weather_id: 'clear', complication_type: 'er_divert', routine_er_divert: false });
  response = 'The rig departs.\n[EN_ROUTE:nearest]\n[CREW_STATUS: partner=driving captain=not_on_scene]\n[TIME: 4:00]';
  await s.send('Depart for the nearest hospital.');
  response = 'Monitoring continues.\n[TIME: 16:00]';
  await s.send('Continue monitoring.');
  assert.equal(s.transportStatus().eta_seconds, 30);
  assert.equal(s.incident, null);
  response = 'Monitoring continues.\n[TIME: 17:00]';
  const rejected = await s.send('Continue monitoring.');
  assert.equal(rejected.arrived, false);
  assert.equal(s.sceneMinute, 16.5);
  assert.equal(s.transportStatus().phase, 'diverted');
  assert.match(rejected.reply, /ER is on diversion/);

  response = 'The rig redirects.\n[EN_ROUTE:major]\n[INCIDENT_RECOVERY: alternate_destination]\n[CREW_STATUS: partner=driving captain=not_on_scene]\n[TIME: 18:00]';
  await s.send('Redirect to the major hospital.');
  const reroute = s.transportStatus();
  assert.equal(reroute.destination, 'University Medical Center');
  assert.ok(Math.abs(reroute.distance_mi - 12.75) < 1e-8);
  assert.equal(reroute.eta_seconds, 1275);

  const id = randomUUID();
  const restored = restoreSession({ ...structuredClone(s), id });
  assert.deepEqual(restored.transportStatus(), reroute);
  deleteSession(id);
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

test('legacy runs: the real turn route returns unavailable equipment during confirmation without running a turn', async () => {
  const s = session('BLS', true);
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

test('shock sets are staged once without joules and cardioversion still honors SYNC', async () => {
  const id = randomUUID(), ownerId = 'shock-test-browser-owner';
  const s = restoreSession({ id, ownerId, seed: session().seed, turns: [] });
  const route = router.stack.find(entry => entry.route?.path === '/:id/turn').route.stack[0].handle;
  async function turn(body) {
    let payload, status = 200;
    const res = { status(code) { status = code; return this; }, json(value) { payload = value; return this; } };
    await route({ params: { id }, headers: { cookie: `ems_owner=${ownerId}` }, body }, res);
    return { status, payload };
  }
  try {
    for (const [message, sync] of [
      ['Synchronized cardioversion at 150 joules.', false],
      ['Synchronized cardioversion at 200 joules.', true],
    ]) {
      const operation_id = randomUUID();
      const body = { message, operation_id, shock_interactive: true };
      const { payload: { needs_confirmation } } = await turn(body);
      assert.deepEqual(needs_confirmation.map(item => item.procedure_id), ['cardioversion']);
      const confirmed = { ...body, procs_resolved: true, proc_allow: needs_confirmation.map(item => item.key) };
      const before = s.turns.length;
      request = null;
      const { payload: { needs_shock } } = await turn(confirmed);
      const [pending] = needs_shock.rolls;
      assert.ok(!('shock_energy' in pending));
      assert.equal(s.turns.length, before);
      assert.equal(request, null);
      assert.deepEqual((await turn(confirmed)).payload.needs_shock.rolls, [pending]);
      reply('The shock delivered. Reassess the rhythm.', '2:00');
      const finalRequest = { ...confirmed, shock_sync: [sync] };
      const result = await turn(finalRequest);
      assert.equal(result.status, 200);
      const [resolved] = result.payload.rolls;
      assert.ok(!('shock_energy' in resolved));
      assert.equal(resolved.shock_sync, sync);
      if (!sync) {
        assert.equal(resolved.roll, 1);
        assert.equal(resolved.outcome, 'COMPLICATION');
        assert.match(request, /cardioversion — d20=1 vs DC .*COMPLICATION.*SYNC was off/);
      } else {
        assert.equal(resolved.roll, pending.roll);
        assert.equal(resolved.outcome, pending.outcome);
      }
      assert.equal(s.turns.at(-1).rolls[0].roll, resolved.roll);
      assert.equal((await turn(finalRequest)).payload.rolls[0].roll, resolved.roll);
      assert.equal(s.turns.length, before + 1);
    }
    const body = { message: 'Defibrillate at 250 joules. Start chest compressions.', operation_id: randomUUID(), shock_interactive: true };
    const { payload: { needs_confirmation } } = await turn(body);
    assert.ok(needs_confirmation.some(item => item.procedure_id === 'defibrillation'));
    const confirmed = { ...body, procs_resolved: true, proc_allow: needs_confirmation.map(item => item.key) };
    const before = s.turns.length;
    request = null;
    const { payload: { needs_shock } } = await turn(confirmed);
    assert.deepEqual(needs_shock.rolls.map(r => r.procedure_id).sort(), ['cpr', 'defibrillation']);
    assert.equal(s.turns.length, before);
    assert.equal(request, null);
    reply('The shock delivered. Chest compressions resume.', '3:00');
    const finalRequest = { ...confirmed, shock_sync: [false] };
    const { status, payload } = await turn(finalRequest);
    assert.equal(status, 200);
    assert.equal(payload.rolls.length, needs_shock.rolls.length);
    for (const staged of needs_shock.rolls) {
      const committed = payload.rolls.find(r => r.procedure_id === staged.procedure_id);
      assert.equal(committed.roll, staged.roll);
      assert.equal(committed.outcome, staged.outcome);
      assert.ok(!('shock_energy' in committed));
    }
    assert.doesNotMatch(request, /The device delivered a shock at/);
    assert.deepEqual((await turn(finalRequest)).payload.rolls, payload.rolls);
    assert.equal(s.turns.length, before + 1);
  } finally {
    deleteSession(id);
  }
});


test('checklist runs permit BLS ECG acquisition even when crossed off, without inventing ALS backup', async () => {
  const s = session('BLS');
  assert.equal(s.seed.protocols.ecg_transmit, false);
  reply('The ECG paper is acquired and transmitted.', '2:00');
  const result = await s.send('Acquire a 12-lead ECG.');
  assert.equal(result.rolls[0].procedure_id, 'twelve_lead');
  assert.equal(s.turns.at(-1).twelveLeads.length, 1);
  assert.doesNotMatch(request, /An arrived ALS resource|CANNOT be performed/);
});

test('a measured fingerstick exposes only the glucose from that check and patient', async () => {
  const s = session();
  reply('Fingerstick glucose is 106.', '1:00', '[VITALS: Glucose=106@T+1:00]');
  const checked = await s.send('Check glucose.');
  assert.equal(checked.rolls.find(roll => roll.procedure_id === 'glucometry').glucose, 106);

  reply('No new reading is available.', '2:00', '[VITALS: Glucose=106@T+1:00]');
  const stale = await s.send('Recheck glucose.');
  assert.equal(stale.rolls.find(roll => roll.procedure_id === 'glucometry').glucose, undefined);

  reply('The primary patient still has a glucose of 106.', '3:00', '[VITALS: Glucose=106@T+3:00]');
  const other = await s.send('Get a BGL on patient 2.');
  const glucoseRoll = other.rolls.find(roll => roll.procedure_id === 'glucometry');
  assert.equal(glucoseRoll.patient, 'patient_2');
  assert.equal(glucoseRoll.glucose, undefined);
});

test('trauma artwork selects the recorded method and named splint site', () => {
  const roll = action => detectWithConfirmation(action).rolls[0];
  assert.equal(roll('Pack the wound with gauze.').hemorrhage_method, 'packing');
  assert.equal(roll('Apply a pressure dressing.').hemorrhage_method, 'dressing');
  assert.equal(roll('Apply a C collar.').trauma_variant, 'collar');
  const radius = roll('Splint the left distal radius.');
  assert.deepEqual([radius.splint_region, radius.splint_site, radius.splint_side], ['forearm', 'radius', 'left']);
  const femur = roll('Apply a traction splint to the right femur.');
  assert.deepEqual([femur.splint_region, femur.splint_site, femur.splint_device], ['thigh', 'femur', 'traction']);
});
