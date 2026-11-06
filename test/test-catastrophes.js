'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-catastrophes-'));
process.env.EMS_DATA_DIR = dataDir;
let response, request, fail = false;
require.cache[require.resolve('../src/engine/api')] = { exports: {
  sendTurn: async (_system, messages) => { request = messages.at(-1).content; if (fail) throw new Error('offline'); return response; },
  sendDebrief: async () => '',
} };
const { Session } = require('../src/engine/session');
const { rollScenario } = require('../src/engine/roller');
const { assembleSeedBlock, buildDebriefContext } = require('../src/engine/assembler');
const { CREW } = require('../src/data/crew');
const { CATASTROPHES, CATASTROPHE_RATES, rollCatastrophe, crewMedicalProfile } = require('../src/engine/catastrophes');
const { restoreSession, deleteSession } = require('../src/server/sessionStore');
const { captainPresent } = require('../src/engine/prompts/transport');
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
function scene(id, role = 'partner') {
  const seed = rollScenario({ random_seed: 'catastrophe-tests', difficulty: 'HARD', category: 'medical' });
  Object.assign(seed, { complication_type: id === 'er_divert' ? id : 'catastrophic', complication_roll: 1,
    catastrophe: id === 'er_divert' ? undefined : { id, role }, backup_present_on_arrival: false });
  const s = new Session(seed);
  s.sceneMinute = 3;
  s.turns = [{ user: 'Arrive.', assistant: 'Patient on scene.', sceneMinute: 3 }];
  s.crewStatus = { partner: 'on_scene', captain: 'not_on_scene', driver: null };
  return s;
}
function reply(text = 'Care continues.', time = '5:00', tags = '') {
  response = `${text}\n${tags}\n[CREW_STATUS: partner=driving captain=in_back]\n[PATIENT_FOCUS: patient_1 | Original patient]\n[VITALS: GCS=15]\n[TIME: ${time}]`;
}

test('rates, exact probability boundaries and all nine choices', () => {
  assert.deepEqual(CATASTROPHE_RATES, { EASY: 0, NORMAL: 0, HARD: 0.01, BLACK_CLOUD: 0.1 });
  for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
    const s = { difficulty, complication_type: 'all' };
    rollCatastrophe(s, () => CATASTROPHE_RATES[difficulty]);
    assert.equal(s.complication_type, 'all');
  }
  for (let i = 0; i < CATASTROPHES.length; i++) {
    const values = [0.09999, (i + 0.5) / CATASTROPHES.length, 0.9];
    const s = { difficulty: 'BLACK_CLOUD', complication_type: 'all' };
    rollCatastrophe(s, () => values.shift());
    assert.equal(s.catastrophe.id, CATASTROPHES[i].id);
    assert.equal(s.complication_type, 'catastrophic');
  }
});

test('seeded population retains overwhelming ordinary complications and replayable catastrophes', () => {
  for (const difficulty of ['EASY', 'NORMAL', 'HARD', 'BLACK_CLOUD']) {
    let catastrophic = 0;
    const seen = new Set();
    for (let i = 0; i < 1500; i++) {
      const seed = rollScenario({ random_seed: `catastrophe-frequency-${i}`, category: 'cardiac', difficulty });
      if (seed.catastrophe) {
        catastrophic++;
        seen.add(seed.catastrophe.id);
        const replay = rollScenario({ random_seed: `catastrophe-frequency-${i}`, category: 'cardiac', difficulty });
        assert.deepEqual(seed.catastrophe, replay.catastrophe);
      }
    }
    if (difficulty === 'HARD') assert.ok(catastrophic >= 5 && catastrophic <= 35, `${difficulty}: ${catastrophic}`);
    else if (difficulty === 'BLACK_CLOUD') {
      assert.ok(catastrophic >= 110 && catastrophic <= 195, `${difficulty}: ${catastrophic}`);
      assert.equal(seen.size, 9);
    } else assert.equal(catastrophic, 0);
  }
});

test('every named crew member has a fixed medical predisposition; custom crew are stable across calls', () => {
  for (const c of CREW) {
    assert.ok(c.age > 18);
    assert.ok(c.medical_predisposition);
    assert.equal(crewMedicalProfile({ ['crew_' + (c.role.startsWith('captain') ? 'captain' : 'partner')]: c.name }, c.role.startsWith('captain') ? 'captain' : 'partner').condition, c.medical_predisposition);
  }
  assert.deepEqual(crewMedicalProfile({ crew_partner: 'Custom Alex' }, 'partner'), crewMedicalProfile({ crew_partner: 'Custom Alex' }, 'partner'));
});

test('routine diversion occurs naturally on NORMAL and HARD; catastrophic ER event is overcrowding', () => {
  assert.equal(CATASTROPHES.some(c => c.id === 'er_divert'), false);
  assert.equal(CATASTROPHES.some(c => c.id === 'er_overcrowding'), true);
  for (const difficulty of ['NORMAL', 'HARD', 'BLACK_CLOUD']) {
    assert.ok(Array.from({ length: 200 }, (_, i) => rollScenario({ random_seed: `divert-${i}`, difficulty })).some(s => s.complication_type === 'er_divert' || s.routine_er_divert));
  }
});

test('ordinary failures explicitly forbid unseeded catastrophes and catastrophic seeds do not stack the triple', () => {
  const seed = rollScenario({ random_seed: 'ordinary', difficulty: 'NORMAL' });
  assert.match(assembleSeedBlock(seed), /No catastrophic incident is seeded/);
  const s = scene('ambulance_wont_start');
  const prompt = assembleSeedBlock(s.seed);
  assert.match(prompt, /one catastrophe replaces/);
  assert.doesNotMatch(prompt, /BLACK CLOUD TRIPLE COMPLICATION/);
});

test('cot and patient-drop events interrupt loading, including skip and repeated retries', async () => {
  for (const id of ['cot_wont_load', 'patient_dropped']) {
    const s = scene(id);
    reply('The move is interrupted.', '5:00', '[LOADING]\n[EN_ROUTE:nearest]');
    let r = await s.send('Load the patient into the ambulance.');
    assert.equal(r.loading, false);
    assert.equal(r.enRoute, false);
    assert.equal(s.hasLoaded, false);
    r = await s.send('Skip ahead to hospital.', false, 'to_hospital');
    assert.equal(r.arrived, false);
    assert.equal(s.moving, false);
    assert.equal(s.hasLoaded, false);
    assert.equal(s.seed.events.filter(e => e.event_type === 'complication').length, 1);
  }
});

test('engine failure does not appear before departure and cannot be fixed by retrying ignition', async () => {
  const s = scene('ambulance_wont_start');
  reply('Assessment continues.');
  await s.send('Assess breathing.');
  assert.equal(s.incident, null);
  reply('The engine does not start.', '7:00', '[EN_ROUTE:nearest]');
  const r = await s.send('Depart for the nearest hospital.');
  assert.equal(r.enRoute, false);
  assert.equal(r.arrived, false);
  reply('It still does not start.', '9:00', '[INCIDENT_RECOVERY: replacement_transport]\n[EN_ROUTE:nearest]');
  await s.send('Try the ignition again.');
  assert.equal(s.incident.resolved, false);
});

test('roadblocks and both crashes prevent automatic skip arrival and preserve a loaded patient', async () => {
  for (const id of ['road_blocked', 'ambulance_crash_no_injuries', 'ambulance_crash_severe_injuries']) {
    const s = scene(id);
    s.hasLoaded = true;
    s.moving = true;
    reply('Transport is interrupted.', '8:00', '[EN_ROUTE:nearest]');
    const r = await s.send('Skip to arrival.', false, 'to_arrival');
    assert.equal(r.arrived, false, id);
    assert.equal(r.enRoute, false, id);
    assert.equal(s.moving, false, id);
    assert.equal(s.hasLoaded, true, id);
  }
});

test('a completed replacement response restores transport but never fixes the original ambulance', async () => {
  const s = scene('ambulance_wont_start');
  reply('The engine is dead.');
  await s.send('Depart for the hospital.');
  reply('The replacement ambulance arrives; the patient is secured aboard.', '15:00', '[INCIDENT_RECOVERY: replacement_transport]\n[LOADING]');
  const r = await s.send('Request and wait for a replacement ambulance, then transfer the patient.');
  assert.equal(s.incident.resolved, true);
  assert.doesNotMatch(r.reply, /INCIDENT_RECOVERY/);
  reply('The replacement ambulance reaches the ED bay.', '27:00', '[EN_ROUTE:nearest]');
  assert.equal((await s.send('Skip to hospital.', false, 'to_hospital')).arrived, true);
});

test('an absent captain cannot collapse; partner and arrived captain stay incapacitated despite stale tags', async () => {
  for (const role of ['partner', 'captain']) {
    const s = scene('crew_medical_event', role);
    reply('Assessment continues.');
    if (role === 'captain') {
      await s.send('Assess the patient.');
      assert.equal(s.incident, null);
      s.backupStatus = { status: 'on_scene', eta: 0 };
      s.crewStatus.captain = 'on_scene';
    }
    await s.send('Assess the patient.');
    assert.equal(s.crewStatus[role], 'incapacitated');
    reply('Another crew member arrives to help.', '16:00', '[INCIDENT_RECOVERY: replacement_crew]');
    await s.send('Request and wait for a replacement crew.');
    assert.equal(s.incident.resolved, true);
    assert.equal(s.crewStatus[role], 'incapacitated');
    assert.equal(role === 'partner' ? s.crewStatus.driver : captainPresent(s.seed, s.backupStatus, s.crewStatus), role === 'partner' ? 'anonymous' : false);
  }
});

test('backup crashes only on final approach and never becomes an available captain', async () => {
  const s = scene('backup_crash');
  reply('Dispatch confirms backup en route.', '5:00', '[BACKUP: en_route ETA=8]');
  await s.send('Request backup.');
  assert.equal(s.incident, null);
  s.sceneMinute = s.backupArrivalMinute;
  reply('The backup vehicle crashes on approach.', '14:00', '[BACKUP: on_scene ETA=0]');
  const r = await s.send('Continue reassessment.');
  assert.equal(r.backup.status, 'unavailable');
  assert.equal(r.crewStatus.captain, 'unavailable');
  assert.equal(captainPresent(s.seed, s.backupStatus, s.crewStatus), false);
});

test('diversion stays hidden until call-ahead, otherwise appears on arrival, and requires a different destination', async () => {
  for (const report of [false, true]) {
    const s = scene('er_divert');
    s.hasLoaded = true;
    s.moving = true;
    s.transportDest = 'nearest';
    reply('Care continues.');
    await s.send('Reassess breathing.');
    assert.equal(s.incident, null);
    reply('The receiving ER is on divert.', '8:00');
    await s.send(report ? 'Call a report to the hospital.' : 'Skip to hospital.', report, report ? null : 'to_arrival');
    assert.equal(s.incident.id, 'er_divert');
    assert.equal(s.arrivedAtHospital, false);
    reply('Continue to the same hospital.', '10:00', '[INCIDENT_RECOVERY: alternate_destination]\n[EN_ROUTE:nearest]');
    await s.send('Depart for the nearest hospital.');
    assert.equal(s.incident.resolved, false);
    reply('The major hospital accepts the report; the ambulance redirects.', '12:00', '[INCIDENT_RECOVERY: alternate_destination]\n[EN_ROUTE:major]');
    await s.send('Redirect transport to the major hospital.');
    assert.equal(s.incident.resolved, true);
    assert.equal(s.transportDest, 'major');
  }
});

test('ER bed hold gives no radio warning, starts on arrival and enforces forty minutes regardless of claimed handoff', async () => {
  const s = scene('er_overcrowding');
  s.hasLoaded = true;
  s.moving = true;
  s.transportEtaMin = 12;
  reply('The report is acknowledged.', '4:00');
  await s.send('Call the receiving hospital with a report.', true);
  assert.equal(s.incident, null);
  reply('There is no bed; continue care in the ambulance.', '16:00');
  let r = await s.send('Skip to hospital.', false, 'to_arrival');
  assert.equal(s.sceneMinute, 16);
  assert.equal(s.incident.bedAvailableMinute, 56);
  assert.equal(r.arrived, false);
  reply('There is still no bed.', '99:00', '[EN_ROUTE:nearest]');
  r = await s.send('Transfer care to the ED.', true);
  assert.equal(r.closed, false);
  assert.equal(r.arrived, false);
  assert.equal(s.sceneMinute, 18, 'an arbitrary model time jump cannot bypass the wait');
  for (let i = 0; i < 7; i++) {
    reply('Monitoring and existing care continue while awaiting a bed.', '99:00');
    r = await s.send('Skip ahead while continuing care.', false, 'to_arrival');
    assert.equal(r.arrived, false);
  }
  assert.equal(s.sceneMinute, 53);
  reply('A bed finally becomes available.', '58:00');
  r = await s.send('Skip ahead while continuing care.', false, 'to_arrival');
  assert.equal(s.incident.resolved, true);
  assert.equal(r.arrived, true);
  assert.equal(r.closed, false);
});

test('incident state survives restoration, failed turns roll back, and debrief distinguishes seeded from triggered', async () => {
  const s = scene('cot_wont_load');
  fail = true;
  try { await assert.rejects(s.send('Load the patient into the ambulance.'), /offline/); }
  finally { fail = false; }
  assert.equal(s.incident, null);
  assert.equal(s.seed.events.length, 0);
  reply('The cot cannot load.');
  await s.send('Load the patient into the ambulance.');
  const restored = restoreSession({ id: randomUUID(), seed: s.seed, incident: s.incident, messages: s.messages, turns: s.turns, sceneMinute: s.sceneMinute });
  reply('The cot remains jammed.', '9:00', '[EN_ROUTE:nearest]');
  assert.equal((await restored.send('Skip to hospital.', false, 'to_hospital')).arrived, false);
  assert.match(buildDebriefContext(s.seed, s.turns), /cot_wont_load triggered/);
  assert.match(buildDebriefContext(s.seed, s.turns), /possibility, not evidence it occurred/);
  deleteSession(restored.sessionId);
});


test('an explicitly requested forty-minute monitoring interval can finish the ER hold while preserving care', async () => {
  const s = scene('er_overcrowding');
  s.moving = true;
  s.hasLoaded = true;
  s.transportEtaMin = 12;
  reply('No beds are available.', '15:00');
  await s.send('Skip to arrival.', false, 'to_arrival');
  reply('Monitoring and existing care continue for forty minutes until a bed opens.', '55:00');
  const r = await s.send('Continue monitoring and current supportive care for 40 minutes while waiting for a bed.');
  assert.equal(s.sceneMinute, 55);
  assert.equal(r.arrived, true);
  assert.equal(r.closed, false);
});
